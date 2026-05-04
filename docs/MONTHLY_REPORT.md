# Monthly Operations Report

## Overview

Automated monthly email report with key operational metrics for The Spa Synergy. Sent on the 1st of each month covering the previous month.

## Status: Planned

## Proposed Metrics

| Section | Metric | Source |
|---|---|---|
| **Uptime** | Uptime percentage | CloudWatch — AWS/Route53 HealthCheckPercentageHealthy |
| **Uptime** | Average response time (ms) | CloudWatch — AWS/Route53 TimeToFirstByte |
| **SMS** | Messages sent | CloudWatch — AWS/SMSVoice NumberOfTextMessagePartsSent |
| **SMS** | Messages delivered | CloudWatch — AWS/SMSVoice NumberOfTextMessagePartsDelivered |
| **Email** | Emails sent | CloudWatch — AWS/SES Send |
| **Email** | Bounce rate | CloudWatch — AWS/SES Reputation.BounceRate |
| **Deployments** | Deploy count | CloudWatch — SpaSynergy/DeploymentEvent |
| **Health** | API key days until expiry | CloudWatch — SpaSynergy/ApiKeyDaysUntilExpiry |

## Architecture

```
EventBridge (cron: 1st of month, 9 AM ET)
    │
    ▼
Lambda (Node.js)
    ├── Query CloudWatch Metrics API for previous month
    ├── Build HTML email with metrics summary
    └── Send via SES
         │
         ▼
    Recipient inbox (patrick@fortinbras.net, client, etc.)
```

## Implementation Plan

### 1. Lambda Function

- Runtime: Node.js 22
- Memory: 128 MB (sufficient for API calls + HTML generation)
- Timeout: 30 seconds
- Dependencies: `@aws-sdk/client-cloudwatch`, `@aws-sdk/client-ses` (included in Lambda runtime)

The function:
1. Calculates previous month's start/end timestamps
2. Calls `cloudwatch:GetMetricStatistics` for each metric
3. Builds an HTML email with a clean table layout
4. Sends via SES to configured recipients

### 2. EventBridge Rule

```
cron(0 13 1 * ? *)   # 9 AM ET on the 1st of every month (13:00 UTC)
```

### 3. IAM Permissions

- `cloudwatch:GetMetricStatistics`
- `ses:SendEmail`

### 4. Configuration

Environment variables on the Lambda:
- `REPORT_RECIPIENTS` — comma-separated email addresses
- `SES_FROM_EMAIL` — `noreply@thespasynergy.com`

### Cost

$0.00/month — one Lambda invocation per month, well within free tier.

## Alternatives Considered

| Option | Pros | Cons |
|---|---|---|
| **Lambda + metrics API + SES email** (recommended) | Lightweight, clean HTML email, no dependencies | Need to build HTML template |
| **Lambda + Puppeteer screenshot + SES** | Shows exact dashboard visuals | Heavy (~50MB Lambda layer with Chromium), brittle |
| **CloudWatch public dashboard link** | Zero effort, real-time | Not a report, requires client to visit a URL, no historical snapshots |

## Live Dashboard

The CloudWatch dashboard is available at:
[SpaSynergy Dashboard](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=SpaSynergy)

Dashboard definition is stored in `scripts/infra/dashboard.json` and can be redeployed with:
```bash
aws cloudwatch put-dashboard --dashboard-name SpaSynergy --dashboard-body file://scripts/infra/dashboard.json
```
