import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Header } from "./components/Header";
import { CommandPalette } from "./components/CommandPalette";
import { Footer } from "./components/Footer";
import { Cursor, Curtain } from "./components/Motion";
import { BackendStatus } from "./components/BackendStatus";

const Home = lazy(() => import("./pages/Home"));
const Workspace = lazy(() => import("./pages/Workspace"));
const FundsSearch = lazy(() => import("./pages/FundsSearch"));
const Fund = lazy(() => import("./pages/Fund"));
const Share = lazy(() => import("./pages/Share"));
const Encours = lazy(() => import("./pages/Encours"));
const Selection = lazy(() => import("./pages/Selection"));
const Holdings = lazy(() => import("./pages/Holdings"));
const Instrument = lazy(() => import("./pages/Instrument"));
const Distribution = lazy(() => import("./pages/Distribution"));
const Country = lazy(() => import("./pages/Country"));
const Passif = lazy(() => import("./pages/Passif"));
const Compare = lazy(() => import("./pages/Compare"));
const ExportStudio = lazy(() => import("./pages/Export"));
const NotFound = lazy(() => import("./pages/NotFound"));

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Accueil"], [/^\/metiers/, "Espace métiers"], [/^\/fonds$/, "Rechercher un fonds"], [/^\/encours/, "Encours"], [/^\/selection/, "Sélection de fonds"],
  [/^\/portefeuilles/, "Portefeuilles"], [/^\/distribution/, "Distribution"], [/^\/passif/, "Passif"], [/^\/comparateur/, "Comparateur"],
];

export function App() {
  const loc = useLocation();
  const night = loc.pathname === "/" || loc.pathname === "/fonds" || loc.pathname === "/encours";
  useEffect(() => {
    const t = TITLES.find(([re]) => re.test(loc.pathname))?.[1];
    if (t) document.title = `${t} — Rothschild & Co`;
    if (!loc.hash) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname, loc.hash]);
  useEffect(() => {
    document.body.classList.toggle("is-night", night);
  }, [night]);
  return (
    <>
      <Header />
      <BackendStatus />
      <main id="contenu" tabIndex={-1}>
        <Suspense fallback={<div className="page"><div className="skeleton" style={{ height: 420 }} /></div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/metiers" element={<Workspace />} />
            <Route path="/fonds" element={<FundsSearch />} />
            <Route path="/fonds/:id" element={<Fund />} />
            <Route path="/parts/:id" element={<Share />} />
            <Route path="/encours" element={<Encours />} />
            <Route path="/selection" element={<Selection />} />
            <Route path="/portefeuilles" element={<Holdings />} />
            <Route path="/portefeuilles/ligne" element={<Instrument />} />
            <Route path="/distribution" element={<Distribution />} />
            <Route path="/distribution/:pays" element={<Country />} />
            <Route path="/passif" element={<Passif />} />
            <Route path="/comparateur" element={<Compare />} />
            <Route path="/export" element={<ExportStudio />} />
            <Route path="/risques" element={<Navigate to="/fonds#risques" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer night />
      <CommandPalette />
      <Curtain />
      <Cursor />
    </>
  );
}
