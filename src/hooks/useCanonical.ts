import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useCanonical() {
  const location = useLocation();

  useEffect(() => {
    let link = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }

    link.setAttribute("href", `https://neekostats.com.au${location.pathname}`);
  }, [location.pathname]);
}
