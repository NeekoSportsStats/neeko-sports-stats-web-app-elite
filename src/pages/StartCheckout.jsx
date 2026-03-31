import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function StartCheckout() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/neeko-plus", { replace: true });
  }, [navigate]);

  return null;
}
