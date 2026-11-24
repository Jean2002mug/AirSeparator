# AirSeparator

AirSeparator is an educational simulator for static aircraft. Its C++20 engine measures each pair's horizontal distance in nautical miles (NM) and vertical distance in feet. A pair gets `WARNING` only if **both** distances are strictly below their thresholds. Equality on either threshold gives `NO_WARNING`. This status describes only the configured threshold check. The engine compares the calculated distances before any display rounding.

## Run both services with Docker

On Windows, start [Docker Desktop with the WSL 2 Linux engine](https://docs.docker.com/desktop/setup/install/windows-install/). On Linux, use Docker Engine with the Compose plugin. Check that `docker version` shows a **Server** section and that `docker compose version` succeeds. The first build needs internet access for the base images and packages.

If Docker Desktop reports **No virtualization available**, run `wsl --status`. Enable **Virtual Machine Platform** in Windows Features and check that virtualization is enabled in your computer's UEFI/BIOS. Restart Windows, start Docker Desktop again, and recheck `docker version`. [Microsoft's WSL 2 setup instructions](https://learn.microsoft.com/en-us/windows/wsl/install-manual#step-3---enable-virtual-machine-feature)

From the repository root:

Start Docker Desktop
```powershell
docker desktop start --timeout 120
```
Creat and start both containers in backgound and wait 
for health check to pass

```powershell
docker --context desktop-linux compose up -d --wait --wait-timeout 90
```
if docker desktop is already running 
```powershell
docker compose build
docker compose up -d --wait
docker compose ps
```

Open **http://127.0.0.1:8088**. Nginx serves the production React files and forwards `/health` and `/api/` requests to `backend:8080`. Docker resolves `backend` on the project's network. Only Nginx publishes a port on your computer, bound to localhost. To choose another port, set `$env:AIRSEPARATOR_WEB_PORT = '8090'` before starting Compose and use that port in the URL and tests below.

**Verify the running stack** from PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8088/health
Invoke-RestMethod http://127.0.0.1:8088/api/config
python backend/tests/test_api.py --port 8088
```

Health should report `ok`. The optional Python command runs the seven HTTP tests through Nginx, including both POST endpoints. In the browser, **Bay approach** should show one warning across three pairs and **Altitude spacing** should show zero. If startup fails, inspect `docker compose logs frontend backend`.

To verify the five pages, run `node scripts/verify-ui.mjs` from the repository root with the stack running, Node.js 22+ and Chrome installed. It exercises editing, CSV import, filters, results, and keyboard navigation, and saves ten desktop captures to `design/screenshots/sprint-3.1/`. Set `CHROME_PATH` for a non-default Chrome executable and `AIRSEPARATOR_URL` for a different local port.

The backend image build compiles C++20 and runs CTest. The frontend image build runs TypeScript checking and the Vite production build. The final images contain the server and the compiled website respectively. To repeat the build checks from scratch and then start the updated images:

```powershell
docker compose build --no-cache
docker compose up -d --wait
```

To stop and remove both containers and their project network:

```powershell
docker compose down
```

## Build, test and run on Windows without Docker

Open the **x64 Native Tools Command Prompt for Visual Studio** and change to the folder containing this README. The build uses MSVC, CMake (3.20 or newer), and Ninja from Visual Studio's C++ build tools. The HTTP tests also use Python 3.8 or newer with its standard library.

```bat
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
ctest --test-dir build --output-on-failure
build\airseparator.exe
```

The first command configures the build, the second compiles it, and the third runs the engine and HTTP tests. The last command starts the local API at `http://127.0.0.1:8080`. Press Ctrl+C to stop it. Use `build\airseparator.exe 8081` to choose another port. The optional second argument selects the listening address, for example `build\airseparator.exe 8081 127.0.0.1`. The default address is loopback. The backend container passes `0.0.0.0` so Nginx can reach it. Tests start their own server on an available port. For a server-only build, add `-DBUILD_TESTING=OFF` to the configure command to skip the Python requirement.

## Run the React workspace

Start the C++ server using the commands above. If an earlier version is running, press Ctrl+C in its terminal before rebuilding so Windows can replace the executable.

In a second PowerShell window, run these commands from the repository root with Node.js 22.12+ or 24 LTS and npm:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Open the local address Vite prints (usually `http://127.0.0.1:5173`). Vite forwards `/api` and `/health` to `http://127.0.0.1:8080`. To use another backend port, set `$env:AIRSEPARATOR_API_URL = 'http://127.0.0.1:8081'` before starting Vite. Run `npm.cmd run build` in `frontend` to type-check and generate the production files.

The workspace opens on **Simulation** with four aircraft in the **Multiple Aircraft** scenario. Choose a pair to inspect the engine's distances and thresholds. **Scenarios** lets you filter, preview, and load examples. Loading resets scenario aircraft and thresholds, and keeps your user-added aircraft when the combined roster is valid.

Use **Aircraft** to add, edit, remove, or import aircraft. CSV files use the header `callSign,latitudeDegrees,longitudeDegrees,altitudeFeet`, with an optional `color` column containing a hex color such as `#168afa`. Import validates the entire file before adding any rows. Scenario and roster edits last for the current browser session until reload. The theme switch remembers your preference across reloads.

**Results** displays pairwise distances, a summary, and deterministic explanations from the engine response. Live AI follow-up is reserved for Sprint 4. **About** explains the model, rules, and educational use. Map tiles require internet access.

## Try a separation calculation

With the server running, open **PowerShell** in another window.

```powershell
$api = 'http://127.0.0.1:8080'
Invoke-RestMethod "$api/health"
$body = @{
    aircraft = @(
        @{ callSign = 'ac101'; latitudeDegrees = 45; longitudeDegrees = -75; altitudeFeet = 10000 }
        @{ callSign = 'BZ2'; latitudeDegrees = 45; longitudeDegrees = -75; altitudeFeet = 10500 }
    )
} | ConvertTo-Json -Depth 4
Invoke-RestMethod "$api/api/separation" -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 4
```

The aircraft share coordinates and differ in altitude by 500 ft, so the default thresholds produce this response.

```json
{
  "pairs": [
    {"callSignA": "AC101", "callSignB": "BZ2", "horizontalNm": 0.0, "verticalFeet": 500.0, "status": "WARNING"}
  ],
  "warningCount": 1
}
```

## API

| Method and path | Request and response |
| --- | --- |
| `GET /health` | Returns `{"status":"ok"}`. |
| `GET /api/config` | Returns `defaults` for `horizontalNm` and `verticalFeet`, plus inclusive `min` and `max` limits for both thresholds and the aircraft count. |
| `POST /api/separation` | Takes exactly two entries in `aircraft`. Returns one pair and its warning count, as shown above. |
| `POST /api/conflicts` | Takes 2–20 entries in `aircraft`. Returns every distinct pair in input order with a `WARNING` or `NO_WARNING` status, and counts the pairs with a warning. |

Send POST bodies as JSON. Both routes accept an optional top-level `thresholds` object alongside `aircraft`. For example, `"thresholds": {"verticalFeet": 500}` gives the example pair `NO_WARNING` because its vertical distance equals the new threshold. Omitted fields use the defaults. Overrides apply only to that request.

| Field | Accepted values |
| --- | --- |
| `callSign` | 1–7 ASCII letters or digits, unique within the request after conversion to uppercase |
| `latitudeDegrees`, `longitudeDegrees` | Finite numbers in [−90, 90] and [−180, 180] respectively |
| `altitudeFeet` | Finite number in [−2000, 60000] |
| `thresholds.horizontalNm` | Finite number in [0.5, 20], default 5 |
| `thresholds.verticalFeet` | Finite number in [100, 5000], default 1000 |

Each aircraft requires all four fields. Malformed JSON, missing fields, unknown fields, duplicate callsigns, and invalid values return HTTP 400 with an `error` message. The server accepts request bodies up to 64 KiB.

## Engine and dependencies

Horizontal distance uses the Haversine formula on a sphere of radius **3440.065 NM**. Vertical distance uses the absolute difference between the two altitudes in feet. Both calculations and the warning decision live in the C++ engine.

The local server uses [cpp-httplib v0.58.0](https://github.com/yhirose/cpp-httplib/tree/v0.58.0) for HTTP and [nlohmann/json v3.12.0](https://github.com/nlohmann/json/tree/v3.12.0) for JSON parsing and serialization. Each library ships as one header with its license in `backend/third_party`, so builds work offline. Neither library is needed by the calculation engine.
