const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const cloudwatch = new CloudWatchClient({});

exports.handler = async (event) => {
  const appId = event.detail?.appId || 'unknown';
  const branch = event.detail?.branchName || 'unknown';
  const status = event.detail?.jobStatus || event.detail?.jobStatusReason || 'unknown';

  console.log(`Deploy event: app=${appId} branch=${branch} status=${status}`);

  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'SpaSynergy',
    MetricData: [{
      MetricName: 'DeploymentEvent',
      Dimensions: [{ Name: 'AppId', Value: appId }],
      Value: 1,
      Unit: 'Count',
    }],
  }));

  return { status: 'ok' };
};
