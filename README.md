# Forbidden Memories Amigos

Windows launcher with local profiles, virtual memory cards and online two-player rooms for Yu-Gi-Oh! Forbidden Memories Recompiled 0.5.9.

## Play
Download the latest installer from https://github.com/Jc-asastu/forbidden-memories-amigos/releases/latest . Create your name and add your own compatible USA BIN. The first preparation downloads a portable compiler and builds the native game locally. The installer does not contain a game disc or precompiled game engine.

Multiplayer opens a keyboard-driven salon: public rooms on the left, details and deck selection on the right. Use arrows and Enter, or mouse. Create a public room or check Private; private rooms use a code. Both players choose a deck and mark Ready; the leader starts the game. Version 0.6.1 automatically navigates the original title, 2P DUEL, memory-card confirmation and OPEN CARD rules. Both clients wait for the initial five-card hand with 8000 LP before releasing keyboard controls. Only the leader drives the native menus; the guest receives the same inputs through netplay. If loading fails, the session ends and the lobby allows another attempt.

Each duel supports two players. A group of three can use the lobby, take turns or create another room. Three preset decks work without a campaign save. The preset balance is preliminary, not a measured win-rate guarantee. Campaign saves are kept separately.

## Hosting
The friends group uses an automatic meeting address published in meeting.json. Juan's desktop app hosts the WebSocket server behind a temporary Cloudflare tunnel; no VPS or always-on hosting is deployed. Juan must open Multiplayer and keep the app, PC and internet running. Other players automatically discover the address and require no GitHub account. When the tunnel is restarted, the host publishes its new address.

For self-hosting another group, change the repository constant in desktop/meeting.cjs. The publisher machine needs authenticated GitHub CLI and the local setting meetingPublisher=true; these credentials are never included in the installer. Ordinary players do not publish or receive credentials. server/index.cjs can also run standalone.

## Storage (0.5.1)
Before adding the BIN, use Cambiar carpeta / disco to select the drive with space. The game image, compiler download, unpacked tools, build output and child-process temporary files all use that location. Reserve 4 GiB free for first preparation. Fresh installs default to GameData next to the installed app. Existing working installations keep their location; changing the preparation destination preserves profiles and saves. Failed old preparation files are not automatically deleted. The small profile index and save data still live in LocalAppData. For direct duels, the host and all players must update to 0.6.1. Existing completed v0.5 engines are reused without downloading the compiler again.

## Controls and video
Arrows move; Q cross, W square, E circle, R triangle; Enter Start, Backspace Select; A/S/D/F L1/R1/L2/R2. F1 in the launcher opens the illustrated guide.

Version 0.5 fixes native pacing and VBlank at 1.3x for both peers; the speed control and manual turbo are disabled. Video settings include 1–4x internal resolution, nearest/bilinear presentation and textures, window/borderless/fullscreen, and optional presentation interpolation targeting 90–240 FPS. These targets depend on PC/monitor; interpolation can show artifacts. Original 2D artwork retains its original detail. OpenGL is used; experimental Vulkan is not offered as a recommended preset.

## Development
Node 24; npm ci; npm test; npm start. npm run prepare:vendor fetches pinned bootstrap tools. npm run dist builds NSIS. Native changes are applied locally by desktop/native-patch.cjs during preparation. Old native engines are rebuilt before they can join v0.5 games. No registry PATH modifications are made.

## License
Original launcher code is MIT. The upstream recompilation and its dependencies retain their own licenses, including PolyForm Noncommercial. See CREDITOS.md and the upstream NOTICE. This is an unofficial fan project.

## 0.6.1 fixes and validation
The native window stays visible during loading, so a delayed readiness check cannot leave an invisible game playing audio. The launcher selects OPEN CARD instead of DECK NUMBER, waits for either active player's initial hand, and records boot stages and screen diagnostics in the session log. Rules selection reads the menu's pending choice, which is committed by the game when Start is accepted.

Keyboard migration writes QWER, arrows and Enter into the actual profile/session configuration directory used by the engine. Existing files are backed up once; later custom bindings are preserved. This fixes the previous mismatch between the illustrated guide and the original keyboard defaults.

Validation includes 23 automated tests, the real Electron arena flow (public/private rooms, keyboard join, ready/deck changes, video persistence), and two real native clients over the WebSocket/UDP relay reaching the first turn automatically with matching hands, 8000 LP and illustrated cards. A further native test summoned one monster per player, passed the turn to the guest and compared the full board across both clients. Native test audio is disabled with the dummy audio driver and zero volume; test processes are closed afterwards. This local two-client check does not measure internet latency between different homes. OPEN CARD uses the original shared-screen 2P rules; separate private player views are not implemented.
