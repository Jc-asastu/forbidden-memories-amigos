'use strict';
const fs=require('node:fs'),path=require('node:path');
const VERSION='amigos-v5-1.3';
function patchNative(project){
 const base=path.join(project,'psxrecomp/runtime/src');
 function edit(file,changes){const p=path.join(base,file);let s=fs.readFileSync(p,'utf8');if(s.includes('AMIGOS_V5_PATCH')){if(file==='main.cpp'&&!s.includes('FM_AMIGOS_CONFIG_DIR')){s=s.replace('static std::filesystem::path psx_user_data_dir(const char* argv0) {','static std::filesystem::path psx_user_data_dir(const char* argv0) {\n    if (const char* p = std::getenv("FM_AMIGOS_CONFIG_DIR")) return std::filesystem::path(p);');fs.writeFileSync(p,s);}return;}for(const [a,b]of changes){if(!s.includes(a))throw Error('El motor cambió: no se pudo aplicar la mejora '+file);s=s.replace(a,b);}fs.writeFileSync(p,'// AMIGOS_V5_PATCH\n'+s);}
 edit('main.cpp',[
 ['static std::filesystem::path psx_user_data_dir(const char* argv0) {','static std::filesystem::path psx_user_data_dir(const char* argv0) {\n    if (const char* p = std::getenv("FM_AMIGOS_CONFIG_DIR")) return std::filesystem::path(p);'],
 ['g_frame_period_base_ms / (double)g_frame_speed_mult','g_frame_period_base_ms / 1.3'],
 ['extern "C" void psx_set_game_speed(int mult) {','extern "C" void psx_set_game_speed(int mult) {\n    mult = 1; // Fixed rational 1.3x is applied to pacing and VBlank.'],
 ['if (host_keymap_down(HOST_KEYMAP_TURBO, keys, (int)SDL_GetModState())) {','if (false) { // Amigos: manual speed changes are disabled.']
 ]);
 edit('interrupts.c',[
 ['static uint32_t s_vblank_cycles = VBLANK_CYCLES;','static uint32_t s_vblank_cycles = (VBLANK_CYCLES * 10u) / 13u;'],
 ['s_vblank_cycles = VBLANK_CYCLES / mult;','s_vblank_cycles = (VBLANK_CYCLES * 10u) / 13u; // Identical fixed rate for both peers.']
 ]);
 edit('psx_video_menu.c',[
 ['*lo = 1; *hi = PSX_VM_SPEED_MAX; return 1;','return 0; /* Amigos speed is fixed. */'],
 ['static const char *row_value(int m, int row) {','static const char *row_value(int m, int row) {\n    if (m == MENU_GAME && row == 0) return "1.3x (fixed)";'],
 ['if (m == MENU_GAME && row == 0) s_state.speed = v;','if (m == MENU_GAME && row == 0) s_state.speed = 1;']
 ]);
}
module.exports={patchNative,VERSION};
