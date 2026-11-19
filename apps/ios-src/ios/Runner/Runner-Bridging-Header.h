#ifndef Runner_Bridging_Header_h
#define Runner_Bridging_Header_h

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

#ifdef __cplusplus
}
#endif

#endif /* Runner_Bridging_Header_h */
