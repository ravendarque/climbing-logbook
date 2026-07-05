terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State lives in an R2 bucket (S3-compatible API), bootstrapped once via
  # scripts/bootstrap-state.mjs. Only the credentials (access_key/secret_key)
  # are excluded here — supplied via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  # env vars at `terraform init` time, never committed.
  backend "s3" {
    bucket                      = "climbing-logbook-tfstate"
    key                         = "climbing-logbook/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    endpoints = {
      s3 = "https://4f63d74beb21402b8622361525ab4868.r2.cloudflarestorage.com"
    }
  }
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from the environment.
}
