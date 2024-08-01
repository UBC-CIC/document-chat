import boto3
import os
import json

from langchain.chains import create_retrieval_chain
from langchain_community.llms.bedrock import Bedrock
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_postgres.vectorstores import PGVector
from langchain_community.embeddings import BedrockEmbeddings


def handler(event, context):
    prompt = event['queryStringParameters']['prompt']
    chain = create_chain()
    response = chain.invoke({'input': prompt})
    
    return {
        'statusCode': 200,
        'headers': {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*', # TODO: fix for production
            'Access-Control-Allow-Methods': 'GET'
        },
        'body': response['answer']
    }
def create_chain():
    bedrock = boto3.client('bedrock-runtime')
    llm = Bedrock(model_id='mistral.mixtral-8x7b-instruct-v0:1', client=bedrock)
    bedrock_embeddings = BedrockEmbeddings(model_id='amazon.titan-embed-text-v2:0', client=bedrock)
    collection_name = "lci_docs"
    db_secrets = get_db_secret()
    vectorstore = PGVector(
        embeddings=bedrock_embeddings,
        collection_name=collection_name,
        connection=f"postgresql+psycopg2://{db_secrets['username']}:{db_secrets['password']}@{db_secrets['host']}:5432/{db_secrets['dbname']}?sslmode=require",
        use_jsonb=True,
    )
    system_prompt = (
        "Use the given context to answer the question. "
        "If you don't know the answer, say you don't know. "
        "Use three sentence maximum and keep the answer concise. "
        "Context: {context}"
    )
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_prompt),
            ("human", "{input} Mention where in the document you got the information from."),
        ]
    )
    question_answer_chain = create_stuff_documents_chain(llm, prompt)
    retriever = vectorstore.as_retriever()
    return create_retrieval_chain(retriever, question_answer_chain)

def get_db_secret():
    sm_client = boto3.client("secretsmanager")
    database_secret_name = os.getenv("DATABASE_SECRET_NAME")
    response = sm_client.get_secret_value(SecretId=database_secret_name)["SecretString"]
    secret = json.loads(response)
    return secret