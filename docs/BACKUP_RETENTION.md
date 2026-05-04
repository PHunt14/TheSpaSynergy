# Backup & Retention Policy

## Overview

Production infrastructure has backup and deletion protection enabled across all critical resources. This document covers what's protected, how to recover data, and the associated costs.

## What's Protected

| Resource | Protection | Retention | Cost |
|---|---|---|---|
| DynamoDB (all 7 tables) | Point-in-Time Recovery (PITR) | 35 days | ~$0.20/GB/month |
| Cognito User Pool | Deletion protection | N/A (prevents deletion) | Free |
| S3 (public assets) | Versioning | Indefinite (until manually deleted) | Storage cost for old versions |
| AppSync API | N/A | Schema is in code (`amplify/data/resource.ts`) | Free |
| Source code | Git + GitHub | Full history | Free |

### DynamoDB Tables (Production)

All 7 production tables have PITR enabled:

- `Appointment-ioggmkvoizfdbjlunwydeowaim-NONE`
- `Vendor-ioggmkvoizfdbjlunwydeowaim-NONE`
- `Service-ioggmkvoizfdbjlunwydeowaim-NONE`
- `StaffSchedule-ioggmkvoizfdbjlunwydeowaim-NONE`
- `Bundle-ioggmkvoizfdbjlunwydeowaim-NONE`
- `BundleSettings-ioggmkvoizfdbjlunwydeowaim-NONE`
- `SiteSettings-ioggmkvoizfdbjlunwydeowaim-NONE`

PITR allows restoring any table to any second within the last 35 days.

### Cognito User Pool

- Pool ID: `us-east-1_A8heNwirj`
- Deletion protection: **ACTIVE**
- This prevents accidental deletion of the entire user pool (all vendor/admin logins)
- To intentionally delete the pool, you must first disable protection

### S3 Bucket

- Bucket: `the-spa-synergy-public`
- Versioning: **ENABLED**
- All vendor photos, profile images, and public assets are versioned
- Overwriting or deleting a file preserves the previous version

## Recovery Procedures

### Restore a DynamoDB Table

Use this if data was accidentally deleted, corrupted, or you need to roll back a bad data migration.

1. Go to [DynamoDB Console](https://console.aws.amazon.com/dynamodbv2/home?region=us-east-1#tables)
2. Select the table (e.g., `Appointment-ioggmkvoizfdbjlunwydeowaim-NONE`)
3. Click **Backups** tab → **Restore to point in time**
4. Choose the date and time to restore to
5. Enter a new table name (e.g., `Appointment-restored-20260506`)
6. Click **Restore** — this creates a new table with the data as it was at that point
7. Verify the restored data is correct
8. To swap: export items from the restored table and import into the original, or update the AppSync data source to point to the restored table

**Important**: PITR restores to a *new* table. It does not overwrite the existing table.

### Restore an S3 File

Use this if a vendor photo was accidentally overwritten or deleted.

1. Go to [S3 Console](https://console.aws.amazon.com/s3/buckets/the-spa-synergy-public)
2. Navigate to the file (e.g., `vendorPictures/sauna_on-00.JPEG`)
3. Toggle **Show versions** (top of the file list)
4. You'll see all previous versions with timestamps
5. Select the version you want to restore
6. Click **Download** to get it, or **Copy** to restore it as the current version

### Recover a Deleted S3 File

When versioning is enabled, "deleting" a file just adds a delete marker. The file is still there.

1. Go to the S3 bucket → toggle **Show versions**
2. Find the file — it will show a "Delete marker" as the latest version
3. Select the delete marker and click **Delete** (this removes the marker, restoring the file)

## What's NOT Backed Up

| Resource | Why | Mitigation |
|---|---|---|
| Amplify build artifacts | Regenerated on every deploy | Redeploy from Git |
| `.env` / environment variables | Stored in Amplify Console, not in code | Document in `PRODUCTION_CHECKLIST.md` |
| Square OAuth tokens | Stored in DynamoDB (covered by PITR) | Staff can reconnect if needed |
| CloudWatch metrics/logs | Retained per CloudWatch defaults (logs: never expire, metrics: 15 months) | No action needed |
| Lambda function code | In Git (`scripts/infra/`) | Redeploy from scripts |

## Cost Summary

At current data volumes (< 1 GB across all tables):

| Item | Monthly Cost |
|---|---|
| DynamoDB PITR (7 tables) | ~$0.14 |
| S3 versioning overhead | ~$0.01 |
| Cognito deletion protection | Free |
| **Total** | **~$0.15/month** |

## Maintenance

- **PITR** is automatic — no action needed. It continuously backs up as data changes.
- **S3 versioning** is automatic — every upload creates a new version.
- **Old S3 versions** accumulate over time. If storage costs grow, add a lifecycle rule to expire old versions after 90 days:
  ```bash
  aws s3api put-bucket-lifecycle-configuration --bucket the-spa-synergy-public \
    --lifecycle-configuration '{
      "Rules": [{
        "ID": "expire-old-versions",
        "Status": "Enabled",
        "NoncurrentVersionExpiration": { "NoncurrentDays": 90 },
        "Filter": {}
      }]
    }'
  ```
- **Cognito deletion protection** must be manually disabled before the pool can be deleted. This is intentional.

## Enabling on New Tables

If new DynamoDB tables are added (e.g., a new model in `amplify/data/resource.ts`), enable PITR after the first deploy:

```bash
aws dynamodb update-continuous-backups \
  --table-name "NewTable-ioggmkvoizfdbjlunwydeowaim-NONE" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region us-east-1
```
