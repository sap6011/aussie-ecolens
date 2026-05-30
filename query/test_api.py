"""
Aussie EcoLens — API Test Suite
Run with: python3 test_api.py
Make sure uvicorn is running on localhost:8000 before running this
"""

import requests
import json

BASE_URL = "http://localhost:8000"
PASS = "✅ PASS"
FAIL = "❌ FAIL"
results = []

def test(name, response, expect_status=200, check_fn=None):
    status_ok = response.status_code == expect_status
    data = None
    try:
        data = response.json()
    except:
        pass

    check_ok = check_fn(data) if check_fn and data is not None else True
    passed = status_ok and check_ok

    symbol = PASS if passed else FAIL
    results.append(passed)
    print(f"{symbol} {name}")
    if not passed:
        print(f"     Expected status {expect_status}, got {response.status_code}")
        print(f"     Response: {json.dumps(data, indent=2)}")
    else:
        print(f"     Response: {json.dumps(data, indent=2)}")
    print()

print("=" * 60)
print("  Aussie EcoLens API Test Suite")
print("=" * 60)
print()

# ── TEST 1: Query by tags — single tag minimum count ──────────
print("── Test 1: POST /query/tags (single tag) ──")
r = requests.post(f"{BASE_URL}/query/tags", json={"tags": {"Macropus_giganteus": 2}})
test(
    "Find files with Macropus_giganteus >= 2 (expect abc001 + abc002)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 2
)

# ── TEST 2: Query by tags — multiple tags AND logic ───────────
print("── Test 2: POST /query/tags (AND logic, multiple tags) ──")
r = requests.post(f"{BASE_URL}/query/tags", json={"tags": {"Macropus_giganteus": 3, "Vulpes_vulpes": 1}})
test(
    "Find files with kangaroo>=3 AND fox>=1 (expect only abc001)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 1
)

# ── TEST 3: Query by tags — no match ─────────────────────────
print("── Test 3: POST /query/tags (no match) ──")
r = requests.post(f"{BASE_URL}/query/tags", json={"tags": {"Macropus_giganteus": 99}})
test(
    "Query with impossibly high count (expect 0 results)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 0
)

# ── TEST 4: Query by species ──────────────────────────────────
print("── Test 4: POST /query/species ──")
r = requests.post(f"{BASE_URL}/query/species", json={"species": ["Vombatus_ursinus"]})
test(
    "Find files with wombat (expect abc002 + abc003)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 2
)

# ── TEST 5: Query by species — multiple species ───────────────
print("── Test 5: POST /query/species (multiple species) ──")
r = requests.post(f"{BASE_URL}/query/species", json={"species": ["Vulpes_vulpes", "Felis_catus"]})
test(
    "Find files with fox OR cat (expect abc001 + abc003)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 2
)

# ── TEST 6: Query by species — not found ─────────────────────
print("── Test 6: POST /query/species (not found) ──")
r = requests.post(f"{BASE_URL}/query/species", json={"species": ["Fake_species"]})
test(
    "Query for non-existent species (expect 0 results)",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 0
)

# ── TEST 7: Query by thumbnail — found ───────────────────────
print("── Test 7: POST /query/thumbnail (found) ──")
r = requests.post(f"{BASE_URL}/query/thumbnail", json={
    "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/abc001.jpg"
})
test(
    "Get full image from thumbnail URL (expect abc001 original)",
    r,
    expect_status=200,
    check_fn=lambda d: "abc001" in d.get("original_url", "")
)

# ── TEST 8: Query by thumbnail — not found ───────────────────
print("── Test 8: POST /query/thumbnail (not found) ──")
r = requests.post(f"{BASE_URL}/query/thumbnail", json={
    "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/doesnotexist.jpg"
})
test(
    "Thumbnail not found returns 404",
    r,
    expect_status=404
)

# ── TEST 9: Add a tag ─────────────────────────────────────────
print("── Test 9: POST /tags (add tag, operation=1) ──")
r = requests.post(f"{BASE_URL}/tags", json={
    "urls": ["https://s3.amazonaws.com/bucket/images/abc001.jpg"],
    "tags": ["Dromaius_novaehollandiae"],
    "operation": 1
})
test(
    "Add emu tag to abc001 (expect updated=1)",
    r,
    expect_status=200,
    check_fn=lambda d: d.get("updated") == 1
)

# verify the tag was actually added
print("── Test 9b: Verify tag was added ──")
r = requests.post(f"{BASE_URL}/query/species", json={"species": ["Dromaius_novaehollandiae"]})
test(
    "Emu tag now queryable on abc001",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) >= 1
)

# ── TEST 10: Remove a tag ─────────────────────────────────────
print("── Test 10: POST /tags (remove tag, operation=0) ──")
r = requests.post(f"{BASE_URL}/tags", json={
    "urls": ["https://s3.amazonaws.com/bucket/images/abc001.jpg"],
    "tags": ["Dromaius_novaehollandiae"],
    "operation": 0
})
test(
    "Remove emu tag from abc001 (expect updated=1)",
    r,
    expect_status=200,
    check_fn=lambda d: d.get("updated") == 1
)

# ── TEST 11: Remove tag that doesn't exist (should not crash) ─
print("── Test 11: POST /tags (remove non-existent tag) ──")
r = requests.post(f"{BASE_URL}/tags", json={
    "urls": ["https://s3.amazonaws.com/bucket/images/abc001.jpg"],
    "tags": ["Fake_tag_that_doesnt_exist"],
    "operation": 0
})
test(
    "Removing non-existent tag doesn't crash (expect updated=1)",
    r,
    expect_status=200,
    check_fn=lambda d: d.get("updated") == 1
)

# ── TEST 12: Bulk tag update — multiple files ─────────────────
print("── Test 12: POST /tags (bulk update multiple files) ──")
r = requests.post(f"{BASE_URL}/tags", json={
    "urls": [
        "https://s3.amazonaws.com/bucket/images/abc001.jpg",
        "https://s3.amazonaws.com/bucket/images/abc002.jpg"
    ],
    "tags": ["Osphranter_rufus"],
    "operation": 1
})
test(
    "Add red kangaroo tag to 2 files at once (expect updated=2)",
    r,
    expect_status=200,
    check_fn=lambda d: d.get("updated") == 2
)

# cleanup bulk test
requests.post(f"{BASE_URL}/tags", json={
    "urls": [
        "https://s3.amazonaws.com/bucket/images/abc001.jpg",
        "https://s3.amazonaws.com/bucket/images/abc002.jpg"
    ],
    "tags": ["Osphranter_rufus"],
    "operation": 0
})

# ── TEST 13: Delete file ──────────────────────────────────────
print("── Test 13: DELETE /files ──")
r = requests.delete(f"{BASE_URL}/files", json={
    "urls": ["https://s3.amazonaws.com/bucket/videos/abc003.mp4"]
})
test(
    "Delete abc003 video (expect deleted=1)",
    r,
    expect_status=200,
    check_fn=lambda d: d.get("deleted") == 1
)

# verify it's gone
print("── Test 13b: Verify deleted file is gone ──")
r = requests.post(f"{BASE_URL}/query/species", json={"species": ["Felis_catus"]})
test(
    "abc003 no longer appears in species query",
    r,
    expect_status=200,
    check_fn=lambda d: len(d.get("results", [])) == 0
)

# ── TEST 14: Delete file that doesn't exist ───────────────────
print("── Test 14: DELETE /files (not found) ──")
r = requests.delete(f"{BASE_URL}/files", json={
    "urls": ["https://s3.amazonaws.com/bucket/images/doesnotexist.jpg"]
})
test(
    "Delete non-existent file returns 404",
    r,
    expect_status=404
)

# ── SUMMARY ───────────────────────────────────────────────────
print("=" * 60)
passed = sum(results)
total = len(results)
print(f"  Results: {passed}/{total} passed")
if passed == total:
    print("  🎉 All tests passed — API is ready for integration!")
else:
    print(f"  ⚠️  {total - passed} test(s) failed — fix before integrating")
print("=" * 60)
print()
print("NOTE: Re-run seed.py to restore abc003 after these tests.")