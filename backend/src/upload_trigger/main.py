import os, json
from datetime import datetime
import boto3
import PyPDF2
import shortuuid
import urllib
from aws_lambda_powertools import Logger

DOCUMENT_TABLE = os.environ["DOCUMENT_TABLE"]
MEMORY_TABLE = os.environ["MEMORY_TABLE"]
QUEUE = os.environ["QUEUE"]
BUCKET = os.environ["BUCKET"]
UPLOADED = "UPLOADED"
ALL_DOCUMENTS = "ALL_DOCUMENTS"


ddb = boto3.resource("dynamodb")
document_table = ddb.Table(DOCUMENT_TABLE)
memory_table = ddb.Table(MEMORY_TABLE)
sqs = boto3.client("sqs")
s3 = boto3.client("s3")
logger = Logger()


def create_document_and_conversation(user_id, filename, pages, filesize):
    timestamp = datetime.utcnow()
    timestamp_str = timestamp.strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    document_id = shortuuid.uuid()
    conversation_id = shortuuid.uuid()

    document = {
        "userid": user_id,
        "documentid": ALL_DOCUMENTS if (filename == ALL_DOCUMENTS) else document_id,
        "filename": filename,
        "created": timestamp_str,
        "pages": pages,
        "filesize": filesize,
        "docstatus": UPLOADED,
        "conversations": [],
        "document_split_ids": [],
    }

    conversation = {"conversationid": conversation_id, "created": timestamp_str}
    document["conversations"].append(conversation)

    conversation = {"SessionId": conversation_id, "History": []}
    
    return [document, conversation]


@logger.inject_lambda_context(log_event=True)
def lambda_handler(event, context):
    key = urllib.parse.unquote_plus(event["Records"][0]["s3"]["object"]["key"])
    split = key.split("/")
    user_id = split[0]
    file_name = split[1]

    s3.download_file(BUCKET, key, f"/tmp/{file_name}")

    with open(f"/tmp/{file_name}", "rb") as f:
        reader = PyPDF2.PdfReader(f)
        pages = str(len(reader.pages))

    ### Create new document & conversation history
    filesize = str(event["Records"][0]["s3"]["object"]["size"])
    document, conversation = create_document_and_conversation(user_id, file_name, pages, filesize)
    
    document_table.put_item(Item=document)
    memory_table.put_item(Item=conversation)

    ### Create/Update ALL_DOCUMENTS document
    response = document_table.get_item(Key={"userid": user_id, "documentid": ALL_DOCUMENTS})    
    if "Item" not in response:
        documents_all, conversation_all = create_document_and_conversation(user_id, ALL_DOCUMENTS, pages, filesize)
        memory_table.put_item(Item=conversation_all)
    else:
        documents_all = response["Item"]
        documents_all["docstatus"] = UPLOADED
        documents_all["pages"] = str(int(documents_all["pages"]) + int(pages))
        documents_all["filesize"] = str(int(documents_all["filesize"]) + int(filesize))

    document_table.put_item(Item=documents_all)

    message = {
        "documentid": document["documentid"],
        "key": key,
        "user": user_id,
    }
    sqs.send_message(QueueUrl=QUEUE, MessageBody=json.dumps(message))
