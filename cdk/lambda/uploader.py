import os
import boto3

s3_client = boto3.client('s3')

def handler(event, context):
    object_key = event['queryStringParameters']['object_key']
    bucket_name = os.getenv('DOCUMENTS_BUCKET')
    response = s3_client.generate_presigned_post(bucket_name, object_key)
    response = {
        'statusCode': 200,
        'body': response
    }
    return response
