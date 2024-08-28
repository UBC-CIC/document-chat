import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import { Auth } from "aws-amplify";
import Navigation from "../components/Navigation";

interface LayoutProps {
  userInfo: any;
  setUserInfo: (userInfo: any) => void;
}

const Layout: React.FC<LayoutProps> = ({ userInfo, setUserInfo }: LayoutProps) => {

  useEffect(() => {
    (async () => setUserInfo(await Auth.currentUserInfo()))();
  }, []);

  const handleSignOutClick = async (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    await Auth.signOut();
    setUserInfo(null);
  };

  return (
    <div>
      <Navigation
        userInfo={userInfo}
        handleSignOutClick={handleSignOutClick}
      />
      <div className="container mt-6 mb-6">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
