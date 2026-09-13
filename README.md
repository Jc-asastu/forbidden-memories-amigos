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
Before adding the BIN, use Cambiar carpeta / disco to select the drive with space. The game image, compiler download, unpacked tools, build output and child-process temporary files all use that location. Reserve 4 GiB free for first preparation. Fresh installs default to a sibling GameData directory on the same drive, outside the app installation directory. Existing working installations keep their location; changing the preparation destination preserves profiles and saves. Failed old preparation files are not automatically deleted. The small profile index and save data still live in LocalAppData. For direct duels, the host and all players must update to 0.6.1. Existing completed v0.5 engines are reused without downloading the compiler again.

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

## 0.7.0 launcher and updates
The illustrated launcher asks whether the returning player is the selected user. Yes continues; another name creates a separate profile or selects an existing name, case-insensitively. The game image and runtime are shared by local profiles; campaign memory cards remain separate. Offline update checks never block campaign entry.

At each start the launcher checks the latest stable public GitHub release. Updates download on demand into the selected game-data drive, show progress, require the published SHA-256 digest, and install only outside a game or room. The installer restarts the launcher. Windows 0.6.1 users install 0.7.0 once manually to gain this update flow.

Before replacing an older app, the installer runs a standalone data-preservation helper with the existing Electron Node runtime. It backs up profiles and memory cards, moves data stored under the installation directory to sibling locations on the same volume, and atomically rewrites the paths. External game locations stay unchanged. If preserving data fails, installation stops. New installs keep game data outside the program folder. Backups are in LocalAppData/ForbiddenMemoriesAmigos/backups/updates.

The launcher background uses locally packaged generated art with lightweight camera drift, glow and particles, honors reduced motion, and has no automatic music. Its card/pyramid art is currently one illustration, not independently animated objects.

Validation: 29 automated tests cover existing multiplayer plus profile reopen/name reuse, independent saves, migration through app-folder removal, destination collisions, release selection, checksums/tampering, corrupt downloads, offline checks and disk errors. Real Electron UI checks cover first user, returning-user confirmation, new name, reopen, existing-name recovery, update notice and offline campaign entry with image/save preservation.

## 0.7.1 preparation recovery
Opening the launcher only checks and recovers compatible local files. It never automatically downloads tools or rebuilds the game. Incomplete preparation requires Continuar preparación; an already verified image is retained before compilation, including after interruption. Compatible engines and completed build caches are reused, and a missing runtime marker is restored from a matching completed cache. Importing the managed BIN itself verifies it in place. Local setup-events.log records startup and preparation decisions for diagnosis.

Validation: 33 Node tests, plus a real isolated Electron import with simulated compiler interruption followed by a new process reopen: image retained, no image picker, explicit resume, and no second compiler attempt.

## 0.8.0 CPU practice and Escape protection
Jugar vs. la máquina creates a local 2/2 practice room with the CPU already ready, a player-deck selector and Fácil/Medio/Difícil. Comenzar duelo drives the original LOAD and Free Duel menus into the first turn against Simon, whose AI and deck are configured only in a disposable session directory. The campaign card is never overwritten. Five-card hands and 8000 LP remain unchanged; combo width/depth increase from 1 to 3 and the fusion deck gate changes from 20 to 5. All levels use the same balanced dragon deck pool. Balance is preliminary.

Escape no longer invokes the native netplay or connection-barrier exit. Escape in the launcher also cannot leave an active match. This does not add automatic campaign saving: use the original Grabar command. The native marker is amigos-v6-1.3; older motors need one explicit Actualizar el motor del juego step, which reuses existing tools/build output where available and retains the verified BIN. Opening the launcher still never starts preparation automatically.

Validation: 36 Node tests; real Electron practice-room navigation/difficulty/persistence checks; real muted native first turn and CPU monster play; two isolated online clients survive injected Escape at their first turn.
