import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/solid";

const LoginNavigation: React.FC = () => {
  return (
    <nav>
      <div className="container flex flex-wrap items-center justify-between py-24">
        <div className="mx-auto inline-flex items-center self-center text-8xl font-semibold whitespace-nowrap text-teal-900">
          <ChatBubbleLeftRightIcon className="w-16 h-16 mr-2.5" />
          {import.meta.env.VITE_APP_NAME}
        </div>
      </div>
    </nav>
  );
};

export default LoginNavigation;