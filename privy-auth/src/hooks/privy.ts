import { usePrivy } from "@privy-io/react-auth";
import React from "react";

export function usePrivyToken(): string | null {
  const { authenticated, getAccessToken } = usePrivy();
  const [privyToken, setPrivyToken] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!authenticated) {
      setPrivyToken(null);
      return;
    }
    getAccessToken().then(setPrivyToken);
  }, [authenticated]); // eslint-disable-line react-hooks/exhaustive-deps
  return privyToken;
}
