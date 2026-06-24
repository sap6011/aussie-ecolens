# setup_dynamo.py
import boto3

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')

table = dynamodb.create_table(
    TableName='media_files',
    KeySchema=[
        {'AttributeName': 'file_id', 'KeyType': 'HASH'}
    ],
    AttributeDefinitions=[
        {'AttributeName': 'file_id', 'AttributeType': 'S'}
    ],
    BillingMode='PAY_PER_REQUEST'
)
table.wait_until_exists()
print("✅ Table created:", table.table_name)