# Staff and Tags Resources

This directory stores JSON data for staff and tags information before anime creation.

## Structure

Each JSON file should follow this structure (based on script_ak format):

```json
{
  "title": "Anime Title",
  "staff": [
    {
      "name": "Staff Member Name",
      "role": "Role (e.g., Réalisateur, Producteur, Character designer, Musique)"
    }
  ],
  "genres": [
    "Genre1",
    "Genre2"
  ],
  "themes": [
    "Theme1",
    "Theme2"
  ],
  "studios": [
    "Studio Name"
  ]
}
```

## Usage

1. Import process populates these JSON files
2. Admin interface reads from these files for autocomplete in staff and tags tabs
3. Data is used when anime is created