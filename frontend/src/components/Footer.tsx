import { CloudIcon } from "@heroicons/react/24/outline";
import GitHub from "../../public/github.svg";

const Footer: React.FC = () => {
  return (
    <div className="bg-teal-900 mt-auto">
      <footer className="container">
        <div className=" flex flex-row justify-between py-3 text-sm text-white">
          <div className="inline-flex items-center hover:underline">
            <CloudIcon className="w-5 h-5 mr-1.5" />
            <a href="https://cic.ubc.ca">
              UBC Cloud Innovation Center | Powered by Amazon Web Services
            </a>
          </div>
          <div className="inline-flex items-center hover:underline underline-offset-2">
            <img
              src={GitHub}
              alt="Github Logo"
              width={20}
              className="mr-1.5 py-2 mx-2"
            />
            <a href="https://github.com/UBC-CIC/LCI-forestry">
              Source code on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Footer;
