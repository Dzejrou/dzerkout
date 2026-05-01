package com.dzerkout.app

import android.app.Activity
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class WriteUriArgs {
    lateinit var uri: String
    lateinit var content: String
}

@InvokeArg
class ReadUriArgs {
    lateinit var uri: String
}

@TauriPlugin
class FileIoPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun writeUri(invoke: Invoke) {
        val args = invoke.parseArgs(WriteUriArgs::class.java)
        val uri: Uri
        try {
            uri = Uri.parse(args.uri)
        } catch (e: Exception) {
            invoke.reject("Invalid URI: ${e.message}")
            return
        }
        // Perform blocking I/O on a background thread so the Wry event thread
        // (Android main loop) cannot stall. Deliver the result back on the UI
        // thread so Tauri/Wry can reliably flush the JS callback.
        Thread {
            try {
                val os = activity.contentResolver.openOutputStream(uri, "wt")
                    ?: run {
                        activity.runOnUiThread { invoke.reject("openOutputStream returned null for ${args.uri}") }
                        return@Thread
                    }
                os.bufferedWriter(Charsets.UTF_8).use { it.write(args.content) }
                activity.runOnUiThread { invoke.resolve() }
            } catch (e: Exception) {
                val msg = e.message ?: "write failed"
                activity.runOnUiThread { invoke.reject(msg) }
            }
        }.start()
    }

    @Command
    fun readUri(invoke: Invoke) {
        val args = invoke.parseArgs(ReadUriArgs::class.java)
        val uri: Uri
        try {
            uri = Uri.parse(args.uri)
        } catch (e: Exception) {
            invoke.reject("Invalid URI: ${e.message}")
            return
        }
        // Perform blocking I/O on a background thread so the Wry event thread
        // (Android main loop) cannot stall. Deliver the result back on the UI
        // thread so Tauri/Wry can reliably flush the JS callback.
        Thread {
            try {
                val text = activity.contentResolver.openInputStream(uri)
                    ?.bufferedReader(Charsets.UTF_8)
                    ?.use { it.readText() }
                    ?: run {
                        activity.runOnUiThread { invoke.reject("openInputStream returned null for ${args.uri}") }
                        return@Thread
                    }
                if (text.isBlank()) {
                    activity.runOnUiThread { invoke.reject("File is empty") }
                    return@Thread
                }
                val ret = JSObject()
                ret.put("content", text)
                activity.runOnUiThread { invoke.resolve(ret) }
            } catch (e: Exception) {
                val msg = e.message ?: "read failed"
                activity.runOnUiThread { invoke.reject(msg) }
            }
        }.start()
    }
}
