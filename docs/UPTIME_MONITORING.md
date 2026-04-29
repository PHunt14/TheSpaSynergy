# Uptime Monitoring

## Overview

Production uptime monitoring using Route 53 health checks, CloudWatch alarms, and SNS notifications.

**Cost**: ~$3.75/month

| Resource | Cost |
|---|---|
| Route 53 health check (with latency) | $0.75/month |
| CloudWatch dashboard | $3.00/month |
| CloudWatch alarm | Free (within free tier) |
| SNS email alerts | Free |
| SNS SMS alerts | ~$0.01/message |

## What's Monitored

- **HTTPS health check** on `www.thespasynergy.com` every 30 seconds from 5 AWS regions
- **Uptime percentage** — percentage of health checkers reporting healthy
- **Response time** — time to first byte (average and p95)
- **Connection time** — TCP connection establishment (average and p95)
- **SSL handshake time** — TLS negotiation duration
- **Health checker consensus** — how many of the 5 regions see the site as healthy

## Alerting

- **Downtime alert**: Triggers after 2 consecutive failed checks (2 minutes of downtime)
- **Recovery alert**: Sends a notification when the site comes back up
- **Channels**: Email + SMS to the configured recipient

## Setup

### Prerequisites

- AWS CLI installed and configured (`aws configure`)
- IAM permissions for Route 53, CloudWatch, and SNS

### Steps

1. Edit the script to set your email and phone:

```bash
# In scripts/infra/setup-uptime-monitoring.sh
ALERT_EMAIL="your-email@example.com"
ALERT_PHONE="+12401234567"  # E.164 format
```

2. Run the setup:

```bash
chmod +x scripts/infra/setup-uptime-monitoring.sh
./scripts/infra/setup-uptime-monitoring.sh
```

3. **Confirm the email subscription** — check your inbox for an AWS SNS confirmation email and click the link

4. View the dashboard: [CloudWatch Dashboard](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=SpasynergyUptime)

## Monthly Reporting

The CloudWatch dashboard provides all metrics needed for a monthly report:

| Metric | Where to Find | How to Read |
|---|---|---|
| Uptime % | "Uptime Percentage (30-day)" widget | Single number — target 99.9%+ |
| Response time | "Response Time" widget | Avg and p95 in milliseconds |
| Downtime incidents | "Uptime (Health Check Status)" widget | Dips to 0 = downtime |
| Error rate | "Health Checkers Reporting Healthy" widget | Drops below 100% = partial outage |

### Generating a Monthly Report

1. Go to the [CloudWatch Dashboard](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=SpasynergyUptime)
2. Set the time range to the previous month (top-right date picker)
3. Each widget shows the relevant metric for that period
4. Use the "Actions" menu on any widget to export data or take a screenshot

### Automated Monthly Report (Optional Future Enhancement)

To receive an automated monthly email with metrics, you could add a Lambda function on a monthly CloudWatch Events schedule that queries the metrics API and sends a formatted email via SES. This is not set up yet — the dashboard is the current reporting tool.

## Teardown

To remove all monitoring resources:

```bash
chmod +x scripts/infra/teardown-uptime-monitoring.sh
./scripts/infra/teardown-uptime-monitoring.sh <health-check-id>
```

The health check ID is printed by the setup script and can also be found in the [Route 53 Health Checks console](https://console.aws.amazon.com/route53/healthchecks/home).

## Architecture

```
┌──────────────────┐     ┌─────────────────┐
│  Route 53 Health │────▶│  CloudWatch     │
│  Check (5 regions│     │  Metrics        │
│  every 30s)      │     └────────┬────────┘
└──────────────────┘              │
                                  ├──▶ CloudWatch Alarm
                                  │         │
                                  │         ▼
                                  │    ┌─────────┐
                                  │    │   SNS   │──▶ Email
                                  │    │  Topic  │──▶ SMS
                                  │    └─────────┘
                                  │
                                  └──▶ CloudWatch Dashboard
                                       (monthly reporting)
```

## Troubleshooting

| Issue | Fix |
|---|---|
| No email alerts | Confirm the SNS subscription (check spam folder) |
| No SMS alerts | Verify phone is in E.164 format (+1XXXXXXXXXX). Check SNS SMS spending limit in AWS console |
| False alarms | Alarm requires 2 consecutive failures — transient blips won't trigger. If still noisy, increase `--evaluation-periods` to 3 |
| Dashboard shows no data | Health check metrics take ~5 minutes to start appearing after creation |
| "Access denied" on setup | Ensure IAM user/role has `route53:*`, `cloudwatch:*`, `sns:*` permissions |

## AppSync API Key Expiration Monitor

The AppSync API key expires after 365 days. If it expires, the entire public site breaks (no data loads). A separate Lambda runs daily to check the key's expiration and alert you 30 days before it expires.

### How It Works

1. A Lambda function runs daily at 9:00 AM ET via EventBridge
2. It calls `appsync:ListApiKeys` to get the active key's expiration timestamp
3. It publishes a `SpaSynergy/ApiKeyDaysUntilExpiry` metric to CloudWatch
4. A CloudWatch alarm fires when the metric drops to ≤30 days
5. The alarm sends email + SMS via the same SNS topic as uptime alerts

### Setup

```bash
chmod +x scripts/infra/setup-api-key-monitor.sh
./scripts/infra/setup-api-key-monitor.sh
```

The script auto-detects your AppSync API ID. If it can't find it, it will tell you how to provide it manually.

### When the Alarm Fires

Just **redeploy in Amplify Console** (or push any commit). The deploy regenerates the API key with a fresh 365-day expiration. No code changes needed.

### Cost

$0.00/month — the Lambda runs once per day, well within the free tier (1M requests/month).
