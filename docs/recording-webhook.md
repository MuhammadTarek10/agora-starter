# Understanding Agora Cloud Recording Webhooks

This document explains the structure and meaning of the JSON data sent by Agora's cloud recording webhooks. When you implement cloud recording, Agora sends notifications to your specified server URL to inform you about various events in the recording lifecycle.

The JSON you receive is an array of these notifications. Each object in the array represents a single event notification.

---

## Core Notification Structure

Every webhook notification from Agora follows a basic structure. Example:

```json
{
  "noticeId": "a033cd004c324a09b5ce5f822e21d924",
  "productId": 3,
  "eventType": 1,
  "notifyMs": 1752758098157,
  "payload": { ... }
}
```

### Main Fields

| Field       | Description                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| `noticeId`  | A unique identifier for this specific notification. Useful for debugging and de-duplication.  |
| `productId` | Identifies the Agora product. `3` typically stands for Cloud Recording.                       |
| `eventType` | A numerical code representing the specific event that occurred. Most important for handling.  |
| `notifyMs`  | The timestamp (in milliseconds) when the notification was sent from Agora's server.           |
| `payload`   | A JSON object containing detailed information about the event. Structure varies by eventType. |

---

## Common Payload Fields

Inside the `payload` object, you'll frequently find these fields:

- `cname`: The channel name that was recorded.
- `uid`: The User ID associated with the event (often the recording bot's UID).
- `sid`: The session ID, a unique identifier for the entire recording process.

---

## Breakdown of Event Types (`eventType`)

Below is a breakdown of the different event types, grouped by category.

### Cloud Recording Core Events

| Event Type | Name                            | Description                                                                               |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------- |
| 1          | `cloud_recording_error`         | An error occurred during the recording.<br>**Payload:** `errorCode`, `errorMsg`, `module` |
| 2          | `cloud_recording_warning`       | A non-critical issue or warning.<br>**Payload:** `warnCode`                               |
| 3          | `cloud_recording_status_update` | Provides an update on the status of the recording.<br>**Payload:** `status`, `fileList`   |
| 4          | `cloud_recording_file_infos`    | Sent when the recording files are ready (often deprecated/older event).                   |

---

### Session Management

| Event Type | Name               | Description                                                                                                                              |
| ---------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 11         | `session_exit`     | The recording session has ended.<br>**Payload:** `exitStatus` (e.g., 0 for normal exit)                                                  |
| 12         | `session_failover` | The recording service has failed over to a new instance for resilience.<br>**Payload:** `newUid` (UID of the new recording bot instance) |

---

### File Uploading (`serviceType: 2`)

| Event Type | Name                 | Description                                                                                    |
| ---------- | -------------------- | ---------------------------------------------------------------------------------------------- |
| 30         | `uploader_started`   | Uploading files to your cloud storage has begun.                                               |
| 31         | `uploaded`           | All recording files have been successfully uploaded to your cloud storage.                     |
| 32         | `backuped`           | Files have been successfully backed up on Agora's servers.                                     |
| 33         | `uploading_progress` | Provides the progress of the current upload.<br>**Payload:** `progress` (e.g., 10000 for 100%) |
| 34         | `STSExpired`         | The temporary security token (STS) for your cloud storage has expired.                         |

---

### Recorder Status (`serviceType: 1`)

| Event Type | Name                                        | Description                                                                              |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 40         | `recorder_started`                          | The individual recorder instance has started.                                            |
| 41         | `recorder_leave`                            | The recorder has left the channel.<br>**Payload:** `leaveCode` (reason code for leaving) |
| 42         | `recorder_slice_start`                      | A new recording slice (segment) has started.                                             |
| 43, 44     | `recorder_audio/video_stream_state_changed` | The state of an audio or video stream being recorded has changed.                        |
| 45         | `recorder_snapshot_file`                    | A snapshot (screenshot) file has been generated.                                         |
| 46, 47     | `recorder_audio/video_info_changed`         | Properties of an audio or video stream have changed (e.g., codec, resolution).           |

---

### Transcoding Events (`serviceScene: rtsc`)

| Event Type | Name                       | Description                                                 |
| ---------- | -------------------------- | ----------------------------------------------------------- |
| 110        | `cloud_transcoder_started` | The transcoding task has started.                           |
| 111        | `cloud_transcoder_stopped` | The transcoding task has stopped.                           |
| 112        | `cloud_transcoder_status`  | Status update for the ongoing transcoding task.             |
| 113        | `cloud_transcoder_updated` | The configuration of the transcoding task has been updated. |

---

### Postponed Transcoding

| Event Type | Name                              | Description                                                                   |
| ---------- | --------------------------------- | ----------------------------------------------------------------------------- |
| 1001       | `postpone_transcode_final_result` | Final result of a postponed transcoding task after the recording is complete. |

---

## Summary

This breakdown should help you parse and handle the various notifications you receive from the Agora Cloud Recording service. Use the `eventType` field to determine the type of event and refer to the relevant payload fields for details.
