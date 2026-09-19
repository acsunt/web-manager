#include <jni.h>

#if defined(__aarch64__)
#define WEBMANAGER_ABI "arm64-v8a"
#elif defined(__arm__)
#define WEBMANAGER_ABI "armeabi-v7a"
#else
#define WEBMANAGER_ABI "unknown"
#endif

JNIEXPORT jstring JNICALL
Java_com_webmanager_app_MainActivity_nativeAbi(JNIEnv *env, jclass clazz) {
    return (*env)->NewStringUTF(env, WEBMANAGER_ABI);
}
