import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
table = dynamodb.Table('media_files')

test_docs = [
    {
        "file_id": "abc001",
        "original_url": "https://s3.amazonaws.com/bucket/images/abc001.jpg",
        "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/abc001.jpg",
        "file_type": "image",
        "checksum": "d41d8cd98f00b204e9800998ecf8427e",
        "tags": {"Macropus_giganteus": Decimal(3), "Vulpes_vulpes": Decimal(1)},
        "uploaded_by": "test@test.com"
    },
    {
        "file_id": "abc002",
        "original_url": "https://s3.amazonaws.com/bucket/images/abc002.jpg",
        "thumbnail_url": "https://s3.amazonaws.com/bucket/thumbnails/abc002.jpg",
        "file_type": "image",
        "checksum": "abc123def456abc123def456abc12345",
        "tags": {"Macropus_giganteus": Decimal(2), "Vombatus_ursinus": Decimal(1)},
        "uploaded_by": "test@test.com"
    },
    {
        "file_id": "abc003",
        "original_url": "https://s3.amazonaws.com/bucket/videos/abc003.mp4",
        "thumbnail_url": None,
        "file_type": "video",
        "checksum": "ff5a12bc990de1234567890abcdef012",
        "tags": {"Vombatus_ursinus": Decimal(3), "Felis_catus": Decimal(2)},
        "uploaded_by": "test@test.com"
    },
]

for doc in test_docs:
    table.put_item(Item={k: v for k, v in doc.items() if v is not None})
    print(f"Seeded: {doc['file_id']}")

print(f"\n✅ Done — seeded {len(test_docs)} documents")