import os, json
import boto3
from aws_lambda_powertools import Logger
from langchain_community.embeddings import BedrockEmbeddings
from langchain_postgres.vectorstores import PGVector

DOCUMENT_TABLE = os.environ["DOCUMENT_TABLE"]
MEMORY_TABLE = os.environ["MEMORY_TABLE"]
BUCKET = os.environ["BUCKET"]
EMBEDDING_MODEL_ID = os.environ["EMBEDDING_MODEL_ID"]
REGION = os.environ["REGION"]
DATABASE_SECRET_NAME = os.environ["DATABASE_SECRET_NAME"]

ddb = boto3.resource("dynamodb")
document_table = ddb.Table(DOCUMENT_TABLE)
memory_table = ddb.Table(MEMORY_TABLE)
s3 = boto3.client("s3")
logger = Logger()

def get_db_secret():
    sm_client = boto3.client(
        service_name="secretsmanager",
        region_name=REGION,
    )
    response = sm_client.get_secret_value(
        SecretId=DATABASE_SECRET_NAME
    )["SecretString"]
    secret = json.loads(response)
    return secret

@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    user_id = event["requestContext"]["authorizer"]["claims"]["sub"]
    document_id = event["pathParameters"]["documentid"]

    response = document_table.get_item(
        Key={"userid": user_id, "documentid": document_id}
    )
    document = response["Item"]
    logger.info({"document": document})
    logger.info("Deleting DDB items")
    with memory_table.batch_writer() as batch:
        for item in document["conversations"]:
            batch.delete_item(Key={"SessionId": item["conversationid"]})

    document_table.delete_item(
        Key={"userid": user_id, "documentid": document_id}
    )

    logger.info("Deleting S3 objects")
    filename = document["filename"]
    objects = [{"Key": f"{user_id}/{filename}/{filename}"}]
    response = s3.delete_objects(
        Bucket=BUCKET,
        Delete={
            "Objects": objects,
            "Quiet": True,
        },
    )
    logger.info({"Response": response})


    logger.info("Deleting from vector store")

    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION,
    )
    embeddings = BedrockEmbeddings(
        model_id=EMBEDDING_MODEL_ID,
        client=bedrock_runtime,
        region_name=REGION,
    )

    collection_name = f"{user_id}_{filename}"
    db_secret = get_db_secret()
    connection_str = f"postgresql+psycopg2://{db_secret['username']}:{db_secret['password']}@{db_secret['host']}:5432/{db_secret['dbname']}?sslmode=require"

    pgvector = PGVector(
        collection_name=collection_name,
        connection=connection_str,
        embeddings=embeddings,
    )
    pgvector.delete_collection()

    logger.info("Deletion complete")

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
        },
        "body": json.dumps(
            {},
            default=str,
        ),
    }
