use std::env;
use std::fs;
use std::path::PathBuf;

use inspiration_drawer::license::generator::{
    generate_keypair, generate_license, public_key_from_private_key, LicenseGeneratorInput,
};
use inspiration_drawer::license::types::{
    AiCredentialMode, LicenseAiAccess, ManagedApiProfile, PRODUCT_NAME,
};
use std::collections::BTreeMap;

#[derive(Default)]
struct Args {
    generate_keypair: bool,
    public_key_from_file: Option<PathBuf>,
    key_file: Option<PathBuf>,
    private_key: Option<String>,
    machine_id: Option<String>,
    customer: Option<String>,
    edition: Option<String>,
    expire_at: Option<String>,
    features: Option<String>,
    product: Option<String>,
    api_provider: Option<String>,
    api_base_url: Option<String>,
    api_key: Option<String>,
    api_model: Option<String>,
    api_headers: Vec<String>,
    canvas_api_provider: Option<String>,
    canvas_api_base_url: Option<String>,
    canvas_api_key: Option<String>,
    canvas_api_model: Option<String>,
    canvas_api_headers: Vec<String>,
    out: Option<PathBuf>,
}

fn print_help() {
    println!(
        "\
Offline license generator

Usage:
  cargo run --bin license-generator -- --generate-keypair
  cargo run --bin license-generator -- --public-key-from-file signing-key.json
  cargo run --bin license-generator -- \\
    --key-file <signing-key.json> \\
    --machine-id <machine-id-hash> \\
    --customer <customer-name> \\
    --edition pro \\
    --expire-at 2027-06-18 \\
    --features \"*\" \\
    --out license.json

Options:
  --generate-keypair       Print a new Ed25519 private/public key pair.
  --public-key-from-file   Read a signing-key JSON file and print only its public key.
  --key-file <path>        Read the private signing key from a local JSON file.
  --private-key <value>    Base64 Ed25519 32-byte secret key or 64-byte keypair.
  --machine-id <value>     Machine ID hash shown by the app.
  --customer <value>       Customer name.
  --edition <value>        trial, pro, or enterprise.
  --expire-at <date>       Expiration date in YYYY-MM-DD.
  --features <csv>         Comma-separated feature list. Defaults to * for full access.
  --product <value>        Product name. Defaults to {PRODUCT_NAME}.
  --api-provider <value>   Managed API provider for enterprise/Advanced licenses.
  --api-base-url <value>   Managed API Base URL for enterprise/Advanced licenses.
  --api-key <value>        Managed API Key for enterprise/Advanced licenses.
  --api-model <value>      Managed API model for enterprise/Advanced licenses.
  --api-header <k=v>       Optional managed API header. Can be repeated.
  --canvas-api-provider <value>   Managed Canvas AI provider for enterprise/Advanced licenses.
  --canvas-api-base-url <value>   Managed Canvas AI Base URL for enterprise/Advanced licenses.
  --canvas-api-key <value>        Managed Canvas AI API Key for enterprise/Advanced licenses.
  --canvas-api-model <value>      Managed Canvas AI model for enterprise/Advanced licenses.
  --canvas-api-header <k=v>       Optional managed Canvas AI header. Can be repeated.
  --out <path>             Output license path. Prints JSON if omitted.
"
    );
}

fn parse_args() -> Result<Args, String> {
    let mut parsed = Args::default();
    let args = env::args().skip(1).collect::<Vec<_>>();
    let mut index = 0;

    while index < args.len() {
        let flag = &args[index];
        match flag.as_str() {
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            "--generate-keypair" => {
                parsed.generate_keypair = true;
                index += 1;
            }
            "--public-key-from-file" => {
                parsed.public_key_from_file =
                    Some(PathBuf::from(next_value(&args, &mut index, flag)?))
            }
            "--key-file" => {
                parsed.key_file = Some(PathBuf::from(next_value(&args, &mut index, flag)?))
            }
            "--private-key" => parsed.private_key = Some(next_value(&args, &mut index, flag)?),
            "--machine-id" => parsed.machine_id = Some(next_value(&args, &mut index, flag)?),
            "--customer" => parsed.customer = Some(next_value(&args, &mut index, flag)?),
            "--edition" => parsed.edition = Some(next_value(&args, &mut index, flag)?),
            "--expire-at" => parsed.expire_at = Some(next_value(&args, &mut index, flag)?),
            "--features" => parsed.features = Some(next_value(&args, &mut index, flag)?),
            "--product" => parsed.product = Some(next_value(&args, &mut index, flag)?),
            "--api-provider" => parsed.api_provider = Some(next_value(&args, &mut index, flag)?),
            "--api-base-url" => parsed.api_base_url = Some(next_value(&args, &mut index, flag)?),
            "--api-key" => parsed.api_key = Some(next_value(&args, &mut index, flag)?),
            "--api-model" => parsed.api_model = Some(next_value(&args, &mut index, flag)?),
            "--api-header" => parsed
                .api_headers
                .push(next_value(&args, &mut index, flag)?),
            "--canvas-api-provider" => {
                parsed.canvas_api_provider = Some(next_value(&args, &mut index, flag)?)
            }
            "--canvas-api-base-url" => {
                parsed.canvas_api_base_url = Some(next_value(&args, &mut index, flag)?)
            }
            "--canvas-api-key" => {
                parsed.canvas_api_key = Some(next_value(&args, &mut index, flag)?)
            }
            "--canvas-api-model" => {
                parsed.canvas_api_model = Some(next_value(&args, &mut index, flag)?)
            }
            "--canvas-api-header" => parsed
                .canvas_api_headers
                .push(next_value(&args, &mut index, flag)?),
            "--out" => parsed.out = Some(PathBuf::from(next_value(&args, &mut index, flag)?)),
            _ => return Err(format!("Unknown argument: {flag}")),
        }
    }

    Ok(parsed)
}

fn next_value(args: &[String], index: &mut usize, flag: &str) -> Result<String, String> {
    *index += 1;
    let value = args
        .get(*index)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("Missing value for {flag}"))?
        .to_string();
    *index += 1;
    Ok(value)
}

fn split_features(value: Option<String>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn private_key_from_file(path: &PathBuf) -> Result<String, String> {
    let content = fs::read_to_string(path)
        .map_err(|err| format!("Failed to read {}: {err}", path.display()))?;
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) {
        for key in [
            "privateKeyB64",
            "private_key_b64",
            "privateKey",
            "private_key",
        ] {
            if let Some(private_key) = value.get(key).and_then(|item| item.as_str()) {
                return Ok(private_key.trim().to_string());
            }
        }
    }
    Err("Signing key file does not contain privateKeyB64".to_string())
}

fn parse_headers(values: &[String]) -> Result<BTreeMap<String, String>, String> {
    let mut headers = BTreeMap::new();
    for value in values {
        let Some((key, header_value)) = value.split_once('=') else {
            return Err("--api-header must be in key=value format".to_string());
        };
        let key = key.trim();
        let header_value = header_value.trim();
        if key.is_empty() || header_value.is_empty() {
            return Err("--api-header must include a non-empty key and value".to_string());
        }
        headers.insert(key.to_string(), header_value.to_string());
    }
    Ok(headers)
}

fn build_ai_access(args: &Args) -> Result<Option<LicenseAiAccess>, String> {
    let edition = args
        .edition
        .as_deref()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    if edition != "enterprise" {
        return Ok(None);
    }
    Ok(Some(LicenseAiAccess {
        mode: AiCredentialMode::LicenseManaged,
        allow_user_api: false,
        managed_profile: Some(ManagedApiProfile {
            provider: args.api_provider.clone().unwrap_or_default(),
            base_url: args.api_base_url.clone().unwrap_or_default(),
            api_key: args.api_key.clone().unwrap_or_default(),
            model: args.api_model.clone().unwrap_or_default(),
            headers: parse_headers(&args.api_headers)?,
        }),
        canvas_profile: Some(ManagedApiProfile {
            provider: args.canvas_api_provider.clone().unwrap_or_default(),
            base_url: args.canvas_api_base_url.clone().unwrap_or_default(),
            api_key: args.canvas_api_key.clone().unwrap_or_default(),
            model: args.canvas_api_model.clone().unwrap_or_default(),
            headers: parse_headers(&args.canvas_api_headers)?,
        }),
    }))
}

fn build_input(args: &Args) -> Result<LicenseGeneratorInput, String> {
    let private_key = match args.key_file.as_ref() {
        Some(path) => private_key_from_file(path)?,
        None => args
            .private_key
            .clone()
            .ok_or_else(|| "--key-file is required".to_string())?,
    };
    Ok(LicenseGeneratorInput {
        private_key,
        machine_id: args
            .machine_id
            .clone()
            .ok_or_else(|| "--machine-id is required".to_string())?,
        customer: args
            .customer
            .clone()
            .ok_or_else(|| "--customer is required".to_string())?,
        edition: args
            .edition
            .clone()
            .ok_or_else(|| "--edition is required".to_string())?,
        expire_at: args
            .expire_at
            .clone()
            .ok_or_else(|| "--expire-at is required".to_string())?,
        features: split_features(args.features.clone()),
        product: args.product.clone(),
        ai_access: build_ai_access(args)?,
    })
}

fn main() {
    let args = match parse_args() {
        Ok(args) => args,
        Err(err) => {
            eprintln!("{err}");
            print_help();
            std::process::exit(2);
        }
    };

    if args.generate_keypair {
        let keypair = generate_keypair();
        println!("PRIVATE_KEY_B64={}", keypair.private_key_b64);
        println!("PUBLIC_KEY_B64={}", keypair.public_key_b64);
        println!("Build the app with LICENSE_PUBLIC_KEY_B64 set to PUBLIC_KEY_B64.");
        return;
    }

    if let Some(path) = args.public_key_from_file.as_ref() {
        let private_key = match private_key_from_file(path) {
            Ok(value) => value,
            Err(err) => {
                eprintln!("{err}");
                std::process::exit(2);
            }
        };
        match public_key_from_private_key(&private_key) {
            Ok(public_key) => println!("PUBLIC_KEY_B64={public_key}"),
            Err(err) => {
                eprintln!("{err}");
                std::process::exit(2);
            }
        }
        return;
    }

    let input = match build_input(&args) {
        Ok(input) => input,
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(2);
        }
    };
    let generated = match generate_license(input) {
        Ok(generated) => generated,
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(2);
        }
    };

    if let Some(out) = args.out {
        if let Err(err) = fs::write(&out, generated.license_json) {
            eprintln!("Failed to write {}: {err}", out.display());
            std::process::exit(1);
        }
        println!("License written to {}", out.display());
    } else {
        println!("{}", generated.license_json);
    }
}
