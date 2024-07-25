import os
import boto3
import json

from urllib.parse import unquote_plus
from langchain_postgres.vectorstores import PGVector
from langchain_community.embeddings import BedrockEmbeddings
from langchain_community.document_loaders import PyMuPDFLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter

TMP_PATH = '/tmp/file.pdf'

def handler(event, context):
    s3_client = boto3.client('s3')
    for record in event['Records']:
        key = record['s3']['object']['key']
        bucket = record['s3']['bucket']['name']
        file_object = s3_client.get_object(Bucket=bucket, Key=unquote_plus(key))
        content_type = file_object['ContentType']
        if 'pdf' in content_type:
            with open(TMP_PATH, 'wb') as f:
                f.write(file_object['Body'].read())
            process_pdf(key)
        else:
            print(f'Unsupported content type: {content_type}')

def get_db_secret():
    sm_client = boto3.client("secretsmanager")
    database_secret_name = os.getenv("DATABASE_SECRET_NAME")
    response = sm_client.get_secret_value(SecretId=database_secret_name)["SecretString"]
    secret = json.loads(response)
    return secret

def get_vectorstore():
    bedrock = boto3.client('bedrock-runtime')
    bedrock_embeddings = BedrockEmbeddings(model_id='amazon.titan-embed-text-v2:0', client=bedrock)
    collection_name = "lci_docs"
    db_secrets = get_db_secret()
    return PGVector(
        embeddings=bedrock_embeddings,
        collection_name=collection_name,
        connection=f"postgresql+psycopg2://{db_secrets['username']}:{db_secrets['password']}@{db_secrets['host']}:5432/{db_secrets['dbname']}?sslmode=require",
        use_jsonb=True,
    )

def process_pdf(key):
    loader = PyMuPDFLoader(TMP_PATH)
    data = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=10000, chunk_overlap=1000)
    doc = text_splitter.split_documents(data)
    vectorstore = get_vectorstore()
    vectorstore.add_documents(doc)
