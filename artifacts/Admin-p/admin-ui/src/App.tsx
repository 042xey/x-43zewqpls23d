import { useState } from "react";
import { Router, Switch, Route } from "wouter";
import Sidebar from "@/components/Sidebar";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ActiveTokens from "@/pages/ActiveTokens";
import KeywordAlerts from "@/pages/KeywordAlerts";
import SVGGenerator from "@/pages/SVGGenerator";
import EssentialTools from "@/pages/EssentialTools";
import Deploy from "@/pages/Deploy";
import Tunnel from "@/pages/Tunnel";
import Webmail from "@/pages/Webmail";
import Sessions from "@/pages/Sessions";
import Proxies from "@/pages/Proxies";
export default function App() {
  const [authed, setAuthed] = useState<boolean>(
    () => !!sessionStorage.getItem("admin_key"),
  );

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <Router base="/admin-panel">
      <div style={{ display: "flex", minHeight: "100vh" }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: "auto", background: "#0f1117" }}>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/tokens" component={ActiveTokens} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/proxies" component={Proxies} />
            <Route path="/alerts" component={KeywordAlerts} />
            <Route path="/svg" component={SVGGenerator} />
            <Route path="/tools" component={EssentialTools} />
            <Route path="/deploy" component={Deploy} />
            <Route path="/tunnel" component={Tunnel} />
            <Route path="/webmail" component={Webmail} />
            <Route>
              <div style={{ padding: 40, color: "#94a3b8" }}>Page not found.</div>
            </Route>
          </Switch>
        </main>
      </div>
    </Router>
  );
}