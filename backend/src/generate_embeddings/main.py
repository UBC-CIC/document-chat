import os, json
import boto3
from aws_lambda_powertools import Logger
from langchain_community.embeddings import BedrockEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_postgres.vectorstores import PGVector
from langchain.text_splitter import RecursiveCharacterTextSplitter



DOCUMENT_TABLE = os.environ["DOCUMENT_TABLE"]
BUCKET = os.environ["BUCKET"]
EMBEDDING_MODEL_ID = os.environ["EMBEDDING_MODEL_ID"]
REGION = os.environ["REGION"]
DATABASE_SECRET_NAME = os.environ["DATABASE_SECRET_NAME"]
ALL_DOCUMENTS = "ALL_DOCUMENTS"
PROCESSING = "PROCESSING"
READY = "READY"

s3 = boto3.client("s3")
ddb = boto3.resource("dynamodb")
document_table = ddb.Table(DOCUMENT_TABLE)
logger = Logger()


def set_doc_status(user_id, document_id, status, ids=None):
    if (ids):
        UpdateExpression="""
        SET docstatus = :docstatus, 
        document_split_ids = list_append(if_not_exists(document_split_ids, :empty_list), :ids)
        """
        ExpressionAttributeValues={
            ":docstatus": status,
            ":ids": ids,
            ":empty_list": []
        }
    else:
        UpdateExpression="SET docstatus = :docstatus"
        ExpressionAttributeValues={
            ":docstatus": status
        }

    document_table.update_item(
        Key={"userid": user_id, "documentid": document_id},
        UpdateExpression=UpdateExpression,
        ExpressionAttributeValues=ExpressionAttributeValues,
    )

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
    event_body = json.loads(event["Records"][0]["body"])
    document_id = event_body["documentid"]
    user_id = event_body["user"]
    key = event_body["key"]
    file_name_full = key.split("/")[-1]

    set_doc_status(user_id, document_id, PROCESSING)
    set_doc_status(user_id, ALL_DOCUMENTS, PROCESSING)

    s3.download_file(BUCKET, key, f"/tmp/{file_name_full}")

    loader = PyPDFLoader(f"/tmp/{file_name_full}")
    data = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=10000, chunk_overlap=1000)
    split_document = text_splitter.split_documents(data)

    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION,
    )

    embeddings = BedrockEmbeddings(
        model_id=EMBEDDING_MODEL_ID,
        client=bedrock_runtime,
        region_name=REGION,
    )

    db_secret = get_db_secret()
    connection_str = f"postgresql+psycopg2://{db_secret['username']}:{db_secret['password']}@{db_secret['host']}:5432/{db_secret['dbname']}?sslmode=require"

    collection_names = [f"{user_id}_{ALL_DOCUMENTS}", f"{user_id}_{file_name_full}"]
    ids = {
        f"{user_id}_{file_name_full}": [f"{user_id}_{file_name_full}_{i}" for i in range(len(split_document))],
        f"{user_id}_{ALL_DOCUMENTS}": [f"{user_id}_{file_name_full}_{ALL_DOCUMENTS}_{i}" for i in range(len(split_document))]
    }
    for collection_name in collection_names:
        vector_store = PGVector(
            embeddings=embeddings,
            collection_name=collection_name,
            connection= connection_str,
            use_jsonb=True,
        )
    
        vector_store.add_documents(split_document, ids=ids[collection_name])

    set_doc_status(user_id, document_id, READY, ids[f"{user_id}_{file_name_full}"])
    set_doc_status(user_id, ALL_DOCUMENTS, READY, ids[f"{user_id}_{ALL_DOCUMENTS}"])
