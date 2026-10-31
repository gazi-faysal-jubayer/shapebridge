import { render } from "solid-js/web";
import App from "./App";
import "@fontsource-variable/inter";
import "./styles.css";

// where the 3D engine loads its heavy readers from (see `localReaders` in vite.config.ts); absolute,
// because OV runs its OCCT reader in a blob: worker that can't resolve relative URLs
(globalThis as { SB_LIB_BASE?: string }).SB_LIB_BASE = new URL(`${import.meta.env.BASE_URL}libs/`, location.href).href;

render(() => <App />, document.getElementById("root")!);
