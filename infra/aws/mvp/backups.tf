locals {
  backup_bucket_name = replace(lower("${var.project_name}-${data.aws_caller_identity.current.account_id}-${var.aws_region}-backups"), "/[^a-z0-9.-]/", "-")
}

resource "aws_s3_bucket" "backups" {
  bucket = local.backup_bucket_name

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-backups"
  })
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-mvp-backups"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retention_days
    }
  }
}

data "aws_iam_policy_document" "control_plane_backups" {
  statement {
    sid       = "ListBackupBucket"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
  }

  statement {
    sid    = "WriteAndRestoreBackups"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.backups.arn}/postgres/*"]
  }
}

resource "aws_iam_role_policy" "control_plane_backups" {
  name   = "${var.project_name}-backup-bucket"
  role   = aws_iam_role.control_plane.id
  policy = data.aws_iam_policy_document.control_plane_backups.json
}
