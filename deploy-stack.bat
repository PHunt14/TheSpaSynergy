@echo off
echo Deploying DynamoDB tables for spa booking system...

aws cloudformation create-stack ^
  --stack-name spa-booking-tables ^
  --template-body file://infrastructure/dynamodb-tables.yaml ^
  --region us-east-1

echo.
echo Stack creation initiated!
echo Check status with: aws cloudformation describe-stacks --stack-name spa-booking-tables
echo.
pause
