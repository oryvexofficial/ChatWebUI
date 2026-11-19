#ifndef OryvexTunnelExtension_Bridging_Header_h
#define OryvexTunnelExtension_Bridging_Header_h

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Rust OryvexCore C FFI (oryvexcore/src/ffi.rs)
char *oryvexcore_version(void);
void oryvexcore_string_free(char *raw);
char *oryvexcore_core_start(const char *arguments_json);
char *oryvexcore_job_poll(uint64_t id);
char *oryvexcore_job_cancel(uint64_t id);
char *oryvexcore_job_free(uint64_t id);

// hev-socks5-tunnel C API (HevSocks5Tunnel.xcframework)
int hev_socks5_tunnel_main_from_str(const unsigned char *config_str, unsigned int config_len, int tun_fd);
void hev_socks5_tunnel_quit(void);

#ifdef __cplusplus
}
#endif

#endif /* OryvexTunnelExtension_Bridging_Header_h */
