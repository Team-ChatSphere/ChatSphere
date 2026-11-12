# CS-42 Usability Walkthrough

The walkthrough used two local demo accounts: `alice_demo` registered and sent the first direct message; `bob_demo` signed in separately and confirmed receipt. Durations below are approximate elapsed task times, not stopwatch measurements.

| Step | Screen | What the user does | Time taken |
| --- | --- | --- | --- |
| 1 | [Register](01-register.png) | Enter email, username, and password, then create an account. | About 1 minute |
| 2 | [Login](02-login.png) | Sign in with the new account. | About 30 seconds |
| 3 | [Dashboard and first message](03-dashboard-first-message.png) | Open a direct conversation and send the first message. At the narrow walkthrough viewport, the people search field was not available, so the chat was started with the recipient's user ID through **New message**. | About 1 minute |
| 4 | [Message received](04-received.png) | Sign in as the recipient and open the conversation to confirm the message arrived. | About 30 seconds |

The required path from registration through the first message took three screens. The recipient-side screenshot is a separate verification image.

Result: register → first message in 3 screens (target ≤ 3, SRS 6.4) — PASS
