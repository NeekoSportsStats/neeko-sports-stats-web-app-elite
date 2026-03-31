import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const StartCheckout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/neeko-plus", { replace: true });
  }, [navigate]);

  return null;
};

export default StartCheckout;
