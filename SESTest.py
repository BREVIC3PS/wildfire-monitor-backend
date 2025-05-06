import boto3

client = boto3.client(
    "ses",
    region_name="us-west-2",
    aws_access_key_id="AKIATWBJ2MK4IE2PMWFE",
    aws_secret_access_key="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"
)

client.send_email(
    Source="wke9991@gmail.com",
    Destination={"ToAddresses": ["kwang655@usc.edu"]},
    Message={
        "Subject": {"Data": "Test Email from SES"},
        "Body": {
            "Text": {"Data": "Hello, this is a test email without using a custom domain."}
        },
    },
)
