import os
import json
import boto3
from aws_lambda_powertools import Logger
from langchain.memory import ConversationBufferMemory
from langchain.chains import ConversationalRetrievalChain
from langchain_community.chat_message_histories import DynamoDBChatMessageHistory
from langchain_postgres.vectorstores import PGVector
from langchain_community.llms.bedrock import Bedrock
from langchain_community.embeddings import BedrockEmbeddings


MEMORY_TABLE = os.environ["MEMORY_TABLE"]
BUCKET = os.environ["BUCKET"]
MODEL_ID = os.environ["MODEL_ID"]
EMBEDDING_MODEL_ID = os.environ["EMBEDDING_MODEL_ID"]
REGION = os.environ["REGION"]
DATABASE_SECRET_NAME = os.environ["DATABASE_SECRET_NAME"]

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


def get_vector_store(bedrock_embeddings, user_id, file_name):
    collection_name = f"{user_id}_{file_name}"
    db_secrets = get_db_secret()
    connection_str = f"postgresql+psycopg2://{db_secrets['username']}:{db_secrets['password']}@{db_secrets['host']}:5432/{db_secrets['dbname']}?sslmode=require"
    vectorstore = PGVector(
        embeddings=bedrock_embeddings,
        collection_name=collection_name,
        connection=connection_str,
        use_jsonb=True,
    )
    return vectorstore

def create_memory(conversation_id):
    message_history = DynamoDBChatMessageHistory(
        table_name=MEMORY_TABLE, session_id=conversation_id
    )

    memory = ConversationBufferMemory(
        memory_key="chat_history",
        chat_memory=message_history,
        input_key="question",
        output_key="answer",
        return_messages=True,
    )
    return memory

def bedrock_chain(vectore_store, memory, human_input, bedrock_runtime):

    chat = Bedrock(
        model_id=MODEL_ID,
        client=bedrock_runtime,
        model_kwargs={'temperature': 0.0}
    )

    chain = ConversationalRetrievalChain.from_llm(
        llm=chat,
        chain_type="stuff",
        retriever=vectore_store.as_retriever(),
        memory=memory,
        return_source_documents=True,
    )

    response = chain.invoke({"question": human_input})

    return response

@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    event_body = json.loads(event["body"])
    file_name = event_body["fileName"]
    human_input = event_body["prompt"]
    conversation_id = event["pathParameters"]["conversationid"]
    user = event["requestContext"]["authorizer"]["claims"]["sub"]

    bedrock_runtime = boto3.client(
        service_name="bedrock-runtime",
        region_name=REGION,
    )

    embeddings = BedrockEmbeddings(
        model_id=EMBEDDING_MODEL_ID,
        client=bedrock_runtime,
        region_name=REGION,
    )
    
    vector_store = get_vector_store(embeddings, user, file_name)
    memory = create_memory(conversation_id)

    response = bedrock_chain(vector_store, memory, human_input, bedrock_runtime)
    if response:
        print(f"{MODEL_ID} -\nPrompt: {human_input}\n\nResponse: {response['answer']}")
    else:
        raise ValueError(f"Unsupported model ID: {MODEL_ID}")

    logger.info(str(response['answer']))

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
        },
        "body": json.dumps(response['answer']),
    }