import { useState } from "react";
import "./index.css";
import { Amplify, Auth } from "aws-amplify";
import { Authenticator } from '@aws-amplify/ui-react';
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./routes/layout";
import Documents from "./routes/documents";
import Chat from "./routes/chat";
import LoginNavigation from "./components/LoginNavigation";
import Footer from "./components/Footer";

Amplify.configure({
  Auth: {
    userPoolId: import.meta.env.VITE_USER_POOL_ID,
    userPoolWebClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
    region: import.meta.env.VITE_API_REGION,
  },
  API: {
    endpoints: [
      {
        name: import.meta.env.VITE_API_NAME,
        endpoint: import.meta.env.VITE_API_ENDPOINT,
        region: import.meta.env.VITE_API_REGION,
        custom_header: async () => {
          return {
            Authorization: `Bearer ${(await Auth.currentSession())
              .getIdToken()
              .getJwtToken()}`,
          };
        },
      },
    ],
  },
});

function App() {
  const [userInfo, setUserInfo] = useState<any>(null);

  let router = createBrowserRouter([
    {
      path: "/",
      element: <Layout userInfo={userInfo} setUserInfo={setUserInfo}/>,
      children: [
        {
          index: true,
          Component: Documents,
        },
        {
          path: "/doc/:documentid/:conversationid",
          Component: Chat,
        },
      ],
    },
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      {!userInfo && <LoginNavigation/>}
      <Authenticator hideSignUp={true}>
        <RouterProvider router={router} />
      </Authenticator>
      <Footer />
    </div>
  );
}

export default App;
