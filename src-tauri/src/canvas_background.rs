//! Disk/SQLite tasks run in the blocking pool, never on the native window loop.
//! Tickets retain command arrival order even if worker threads start out of order.
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Condvar, Mutex,
};

pub struct CanvasTaskQueue {
    issued: AtomicU64,
    turn: Mutex<u64>,
    wake: Condvar,
}
impl CanvasTaskQueue {
    pub const fn new() -> Self {
        Self {
            issued: AtomicU64::new(0),
            turn: Mutex::new(0),
            wake: Condvar::new(),
        }
    }
    pub fn issue(&self) -> u64 {
        self.issued.fetch_add(1, Ordering::Relaxed)
    }
    pub fn run<T>(
        &self,
        ticket: u64,
        task: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let mut turn = self.turn.lock().map_err(|error| error.to_string())?;
        while *turn != ticket {
            turn = self.wake.wait(turn).map_err(|error| error.to_string())?;
        }
        // Always advance the queue after a recoverable IO error or panic. A failed
        // prior save must not strand later edits or hang shutdown forever.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(task));
        *turn += 1;
        self.wake.notify_all();
        drop(turn);
        match result {
            Ok(result) => result,
            Err(_) => Err("画布后台保存任务异常，后续保存仍可继续".to_string()),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{mpsc, Arc};
    #[test]
    fn ordered_off_thread_work_keeps_the_caller_free() {
        let queue = Arc::new(CanvasTaskQueue::new());
        let first = queue.issue();
        let second = queue.issue();
        let (send, receive) = mpsc::channel();
        let (release, wait) = mpsc::channel();
        let q1 = queue.clone();
        let s1 = send.clone();
        let a = std::thread::spawn(move || {
            q1.run(first, || {
                s1.send(1).unwrap();
                wait.recv().unwrap();
                Ok(())
            })
        });
        assert_eq!(receive.recv().unwrap(), 1);
        let q2 = queue.clone();
        let b = std::thread::spawn(move || {
            q2.run(second, || {
                send.send(2).unwrap();
                Ok(())
            })
        });
        // While background work is blocked, the command caller can process work.
        assert!(receive.try_recv().is_err());
        release.send(()).unwrap();
        assert_eq!(receive.recv().unwrap(), 2);
        a.join().unwrap().unwrap();
        b.join().unwrap().unwrap();
    }
    #[test]
    fn errors_and_panics_do_not_block_later_tasks() {
        let queue = CanvasTaskQueue::new();
        let a = queue.issue();
        let b = queue.issue();
        let c = queue.issue();
        assert!(queue.run::<()>(a, || Err("disk full".to_string())).is_err());
        assert!(queue.run::<()>(b, || panic!("synthetic failure")).is_err());
        assert_eq!(queue.run(c, || Ok(3)).unwrap(), 3);
    }
}
