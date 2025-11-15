#!/bin/bash

mkdir -p img/ol-brand

echo "============================================================"
echo "Logo Conversion Script"
echo "============================================================"
echo ""

# Check if logo.svg exists
if [ ! -f "logo.svg" ]; then
    echo "ERROR: logo.svg not found in current directory!"
    echo ""
    echo "Requirements:"
    echo "  1. Create or place 'logo.svg' in the current directory"
    echo "  2. Ensure the file is a valid SVG file"
    echo ""
    echo "Current directory: $(pwd)"
    echo "============================================================"
    exit 1
fi

# Check if logo_full.svg exists
if [ ! -f "logo_full.svg" ]; then
    echo "ERROR: logo_full.svg not found in current directory!"
    echo ""
    echo "Requirements:"
    echo "  1. Create or place 'logo_full.svg' in the current directory"
    echo "  2. Ensure the file is a valid SVG file"
    echo ""
    echo "Current directory: $(pwd)"
    echo "============================================================"
    exit 1
fi

echo "✓ Found logo.svg"
echo "✓ Found logo_full.svg"
echo ""

# Copy logo.svg to favicon.svg
cp logo.svg favicon.svg
echo "✓ Copied logo.svg to favicon.svg"
echo ""

python generate_favicons.py favicon.svg
echo "✓ Generated other versions from favicon.svg"
echo ""

# Create black/white versions
echo "Creating black/white versions..."
python create_sw_versions.py logo.svg logo_sw.svg "#000000"
python create_sw_versions.py logo.svg mask-favicon.svg "#000000"
python create_sw_versions.py logo_full.svg img/ol-brand/overleaf-black.svg "#000000"

python create_sw_versions.py logo.svg img/ol-brand/overleaf-o-white.svg "#FFFFFF"
python create_sw_versions.py logo_full.svg img/ol-brand/overleaf-white.svg "#FFFFFF"

python create_sw_versions.py logo.svg img/ol-brand/overleaf-o-grey.svg "#808080"

echo ""

# Run the Python icon generator for standard icons (now includes overleaf_og_logo.png)
echo "Generating standard icons from logo.svg..."
python generate_icons.py logo.svg
echo ""

cp -f overleaf_og_logo.png img/ol-brand
cp -f logo-horizontal.png img/ol-brand
cp -f logo.svg img/ol-brand/overleaf-o.svg
cp -f logo_full.svg img/ol-brand/overleaf.svg
cp -f logo_full.svg img/ol-brand/overleaf-a-ds-solution-mallard.svg
cp -f logo_full.svg img/ol-brand/overleaf-green.svg
cp -f logo.svg img/ol-brand/overleaf-o-dark.svg




# Generate additional logos from logo_full.svg
echo "Generating logo-horizontal.png from logo_full.svg..."
python generate_additional_logos.py logo_full.svg logo-horizontal.png 410 180 --export-area-drawing
echo ""

echo "============================================================"
echo "✓ All logos generated successfully!"
echo "============================================================"
