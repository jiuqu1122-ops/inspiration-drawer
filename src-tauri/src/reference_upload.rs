use std::collections::HashMap;
use std::future::Future;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use tokio::sync::{OnceCell, OwnedSemaphorePermit, Semaphore};

use crate::ReferenceUploadFailure;

pub(crate) const CONCURRENCY: usize = 4;
const CACHE_LIFETIME: Duration = Duration::from_secs(120);
const CACHE_CAPACITY: usize = 128;

struct Flight {
    result: OnceCell<Result<String, ReferenceUploadFailure>>,
    created_at: Instant,
}

pub(crate) struct ReferenceUploads {
    permits: Arc<Semaphore>,
    flights: Mutex<HashMap<[u8; 32], Arc<Flight>>>,
}

pub(crate) fn uploads() -> &'static ReferenceUploads {
    static UPLOADS: OnceLock<ReferenceUploads> = OnceLock::new();
    UPLOADS.get_or_init(ReferenceUploads::new)
}

pub(crate) fn cache_key(token: &str, mime: &str, bytes: &[u8]) -> [u8; 32] {
    let mut hash = Sha256::new();
    for part in [token.as_bytes(), mime.as_bytes(), bytes] {
        hash.update((part.len() as u64).to_le_bytes());
        hash.update(part);
    }
    hash.finalize().into()
}

impl ReferenceUploads {
    fn new() -> Self {
        Self {
            permits: Arc::new(Semaphore::new(CONCURRENCY)),
            flights: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn acquire(&self) -> OwnedSemaphorePermit {
        self.permits
            .clone()
            .acquire_owned()
            .await
            .expect("upload queue stays open")
    }

    // Callers hold one permit across preparation and upload, including retries.
    // Successful uploads are briefly shared by content and credentials; failed
    // and cancelled flights remain retryable, without changing reference order.
    pub(crate) async fn run<F, Fut>(
        &self,
        key: [u8; 32],
        upload: F,
    ) -> Result<String, ReferenceUploadFailure>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = Result<String, ReferenceUploadFailure>>,
    {
        let flight = {
            let mut flights = self
                .flights
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            let now = Instant::now();
            // Count cache age from BEFORE issuing the short-lived upload
            // ticket, so a slow upload never extends reference ownership TTL.
            flights.retain(|_, flight| {
                (flight.result.get().is_none() && Arc::strong_count(flight) > 1)
                    || now.duration_since(flight.created_at) < CACHE_LIFETIME
            });
            if flights.len() >= CACHE_CAPACITY {
                flights.retain(|_, flight| {
                    flight.result.get().is_none() && Arc::strong_count(flight) > 1
                });
            }
            flights
                .entry(key)
                .or_insert_with(|| {
                    Arc::new(Flight {
                        result: OnceCell::new(),
                        created_at: Instant::now(),
                    })
                })
                .clone()
        };
        let result = flight.result.get_or_init(upload).await.clone();
        if result.is_err() {
            let mut flights = self
                .flights
                .lock()
                .unwrap_or_else(|error| error.into_inner());
            if flights
                .get(&key)
                .is_some_and(|current| Arc::ptr_eq(current, &flight))
            {
                flights.remove(&key);
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn keys_are_scoped_to_credentials_content_and_format() {
        assert_ne!(
            cache_key("account-a", "image/png", b"image"),
            cache_key("account-b", "image/png", b"image")
        );
        assert_ne!(
            cache_key("account-a", "image/png", b"image"),
            cache_key("account-a", "image/png", b"changed")
        );
        assert_ne!(
            cache_key("account-a", "image/png", b"image"),
            cache_key("account-a", "image/jpeg", b"image")
        );
    }

    #[test]
    fn concurrent_nodes_share_uploads_and_obey_the_global_limit() {
        tauri::async_runtime::block_on(async {
            let uploads = Arc::new(ReferenceUploads::new());
            let active = Arc::new(AtomicUsize::new(0));
            let peak = Arc::new(AtomicUsize::new(0));
            let calls = Arc::new(AtomicUsize::new(0));
            let mut handles = Vec::new();
            for index in 0..18 {
                let (uploads, active, peak, calls) =
                    (uploads.clone(), active.clone(), peak.clone(), calls.clone());
                handles.push(tauri::async_runtime::spawn(async move {
                    let permit = uploads.acquire().await;
                    uploads
                        .run([index % 9; 32], || async move {
                            let _permit = permit;
                            calls.fetch_add(1, Ordering::SeqCst);
                            let count = active.fetch_add(1, Ordering::SeqCst) + 1;
                            peak.fetch_max(count, Ordering::SeqCst);
                            tokio::time::sleep(Duration::from_millis(10)).await;
                            active.fetch_sub(1, Ordering::SeqCst);
                            Ok(format!("reference-images/{}.png", index % 9))
                        })
                        .await
                        .unwrap()
                }));
            }
            for (index, handle) in handles.into_iter().enumerate() {
                assert_eq!(
                    handle.await.unwrap(),
                    format!("reference-images/{}.png", index % 9)
                );
            }
            assert_eq!(calls.load(Ordering::SeqCst), 9);
            assert!(peak.load(Ordering::SeqCst) <= CONCURRENCY);
        });
    }

    #[test]
    fn failed_uploads_are_not_cached() {
        tauri::async_runtime::block_on(async {
            let uploads = ReferenceUploads::new();
            let failure = crate::ReferenceUploadFailure::new(
                None,
                crate::ReferenceUploadOperation::SignedPut,
                crate::ReferenceUploadFailureReason::HttpStatus(503),
            );
            assert!(uploads
                .run([0; 32], || async { Err(failure) })
                .await
                .is_err());
            assert_eq!(
                uploads
                    .run([0; 32], || async {
                        Ok("reference-images/recovered.png".to_string())
                    })
                    .await
                    .unwrap(),
                "reference-images/recovered.png"
            );
        });
    }

    #[test]
    fn cached_keys_expire_from_the_start_of_the_upload() {
        tauri::async_runtime::block_on(async {
            let uploads = ReferenceUploads::new();
            let key = [3; 32];
            uploads
                .run(key, || async { Ok("reference-images/old.png".to_string()) })
                .await
                .unwrap();
            {
                let mut flights = uploads.flights.lock().unwrap();
                Arc::get_mut(flights.get_mut(&key).unwrap())
                    .unwrap()
                    .created_at = Instant::now() - CACHE_LIFETIME - Duration::from_secs(1);
            }
            assert_eq!(
                uploads
                    .run(key, || async {
                        Ok("reference-images/fresh.png".to_string())
                    })
                    .await
                    .unwrap(),
                "reference-images/fresh.png"
            );
        });
    }

    #[test]
    fn cancelling_an_upload_releases_capacity_and_allows_a_new_attempt() {
        tauri::async_runtime::block_on(async {
            let uploads = Arc::new(ReferenceUploads::new());
            let pending_uploads = uploads.clone();
            let (started, ready) = tokio::sync::oneshot::channel();
            let pending = tokio::spawn(async move {
                let permit = pending_uploads.acquire().await;
                pending_uploads
                    .run([4; 32], || async move {
                        let _permit = permit;
                        let _ = started.send(());
                        std::future::pending::<Result<String, ReferenceUploadFailure>>().await
                    })
                    .await
            });
            ready.await.unwrap();
            pending.abort();
            assert!(pending.await.unwrap_err().is_cancelled());
            assert_eq!(uploads.permits.available_permits(), CONCURRENCY);
            assert_eq!(
                uploads
                    .run([4; 32], || async {
                        Ok("reference-images/restarted.png".to_string())
                    })
                    .await
                    .unwrap(),
                "reference-images/restarted.png"
            );
        });
    }
}
