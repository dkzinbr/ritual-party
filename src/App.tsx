import { PartyProvider } from "./context";
import { GuestApp } from "./GuestApp";
import { HostApp } from "./HostApp";

export function App() {
  if (window.location.pathname.startsWith("/mestre")) return <HostApp />;
  return (
    <PartyProvider>
      <GuestApp />
    </PartyProvider>
  );
}
