#!/bin/bash
# ──────────────────────────────────────────────────────────────
# Teardown uptime monitoring resources
#
# Usage:
#   ./scripts/infra/teardown-uptime-monitoring.sh <health-check-id>
#
# The health check ID is printed by the setup script.
# You can also find it in the Route 53 console.
# ──────────────────────────────────────────────────────────────

set -euo pipefail

REGION="us-east-1"
HEALTH_CHECK_NAME="spa-synergy-production"
SNS_TOPIC_NAME="spa-synergy-uptime-alerts"
DASHBOARD_NAME="SpasynergyUptime"

HEALTH_CHECK_ID="${1:-}"
if [ -z "$HEALTH_CHECK_ID" ]; then
  echo "Usage: $0 <health-check-id>"
  echo "Find it in Route 53 console or from the setup script output."
  exit 1
fi

echo "Removing uptime monitoring resources..."

# Delete alarm
aws cloudwatch delete-alarms \
  --alarm-names "${HEALTH_CHECK_NAME}-down" \
  --region "$REGION" 2>/dev/null && echo "✓ Alarm deleted" || echo "⚠ Alarm not found"

# Delete dashboard
aws cloudwatch delete-dashboards \
  --dashboard-names "$DASHBOARD_NAME" \
  --region "$REGION" 2>/dev/null && echo "✓ Dashboard deleted" || echo "⚠ Dashboard not found"

# Delete health check
aws route53 delete-health-check \
  --health-check-id "$HEALTH_CHECK_ID" 2>/dev/null && echo "✓ Health check deleted" || echo "⚠ Health check not found"

# Find and delete SNS topic
TOPIC_ARN=$(aws sns list-topics --region "$REGION" --query "Topics[?ends_with(TopicArn, ':${SNS_TOPIC_NAME}')].TopicArn" --output text 2>/dev/null)
if [ -n "$TOPIC_ARN" ]; then
  aws sns delete-topic --topic-arn "$TOPIC_ARN" --region "$REGION"
  echo "✓ SNS topic deleted"
else
  echo "⚠ SNS topic not found"
fi

echo ""
echo "Done. All monitoring resources removed."
