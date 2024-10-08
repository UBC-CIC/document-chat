import { useState, useEffect } from "react";
import { API } from "aws-amplify";
import { Link } from "react-router-dom";
import DocumentDetail from "./DocumentDetail";
import { ArrowPathRoundedSquareIcon } from "@heroicons/react/24/outline";
import { Document } from "../common/types";
import Loading from "../../public/loading-grid.svg";

const ALL_DOCUMENTS = "ALL_DOCUMENTS";

const DocumentList: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [listStatus, setListStatus] = useState<string>("idle");

  const fetchData = async () => {
    setListStatus("loading");
    const documents = await API.get(import.meta.env.VITE_API_NAME, "/doc", {});
    setListStatus("idle");

    const sortedDocuments = documents.sort((a: Document, b:Document) => {
      if (a.filename === ALL_DOCUMENTS) return -1;
      if (b.filename === ALL_DOCUMENTS) return 1;
      return 0;
    });
  
    setDocuments(sortedDocuments);
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div>
      <div className="flex justify-between pt-6 pb-4">
        <h2 className="text-2xl font-bold text-gray-800">My documents</h2>
        <button
          onClick={fetchData}
          type="button"
          className="text-gray-700 border border-gray-700 hover:bg-gray-700 hover:text-white focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm p-2 text-center inline-flex items-center"
        >
          <ArrowPathRoundedSquareIcon
            className={`w-5 h-5 ${
              listStatus === "loading" ? "animate-spin" : ""
            }`}
          />
        </button>
      </div>
      <div className="max-h-80 grid grid-cols-3 gap-4 overflow-y-auto">
        {documents && documents.length > 0 &&
          documents.map((document: Document) => (
            <Link
              to={`/doc/${document.documentid}/${document.conversations[0].conversationid}/`}
              key={document.documentid}
              className="block p-6 bg-white border border-gray-200 rounded hover:bg-gray-100"
            >
              <DocumentDetail document={document} onDocumentDeleted={fetchData}/>
            </Link>
        ))}
      </div>
      {listStatus === "idle" && documents.length === 0 && (
        <div className="flex flex-col items-center mt-4 text-gray-800">
          <p className="font-bold text-lg">There's nothing here yet...</p>
          <p className="mt-1">Upload your first document to get started!</p>
        </div>
      )}
      {listStatus === "loading" && documents.length === 0 && (
        <div className="flex flex-col items-center mt-4">
          <img src={Loading} width={40} />
        </div>
      )}
    </div>
  );
};

export default DocumentList;
