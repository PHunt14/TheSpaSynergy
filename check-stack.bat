@echo off
echo Checking stack status...
echo.

aws cloudformation describe-stacks ^
  --stack-name spa-booking-tables ^
  --region us-east-1 ^
  --query "Stacks[0].StackStatus" ^
  --output text

echo.
pause
