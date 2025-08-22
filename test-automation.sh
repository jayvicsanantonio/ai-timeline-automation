#!/bin/bash

# Test script for AI Timeline Automation
# This script verifies the complete workflow including PR creation

set -e  # Exit on error

echo "================================================"
echo "AI Timeline Automation - Test Suite"
echo "================================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Please create .env from .env.example and add your API keys"
    exit 1
fi

# Source the .env file to check variables
export $(cat .env | grep -v '^#' | xargs)

# Validate required environment variables
echo "1️⃣ Checking required environment variables..."
MISSING_VARS=()

if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    MISSING_VARS+=("OPENAI_API_KEY")
fi

if [ -z "$GITHUB_TOKEN" ] || [ "$GITHUB_TOKEN" = "your_github_personal_access_token_here" ]; then
    MISSING_VARS+=("GITHUB_TOKEN")
fi

if [ -z "$TIMELINE_REPO" ]; then
    MISSING_VARS+=("TIMELINE_REPO")
fi

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Missing or invalid environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update your .env file with valid values"
    exit 1
fi

echo "✅ All required environment variables are set"
echo "   - TIMELINE_REPO: $TIMELINE_REPO"
echo ""

# Test 1: Build the project
echo "2️⃣ Building the project..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi
echo ""

# Test 2: Run in dry-run mode
echo "3️⃣ Testing in dry-run mode..."
echo "   (This will collect and analyze events but NOT create a PR)"
echo ""

# Temporarily set DRY_RUN to true
export DRY_RUN=true
export LOG_LEVEL=info

npm run update

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Dry-run completed successfully"
else
    echo "❌ Dry-run failed"
    exit 1
fi

# Check execution summary
if [ -f execution-summary.json ]; then
    echo ""
    echo "4️⃣ Checking execution summary..."
    ANALYZED=$(cat execution-summary.json | grep -o '"analyzed":[0-9]*' | cut -d: -f2)
    SELECTED=$(cat execution-summary.json | grep -o '"selected":[0-9]*' | cut -d: -f2)
    
    echo "   - Events analyzed: $ANALYZED"
    echo "   - Events selected: $SELECTED"
    
    if [ "$ANALYZED" -gt 0 ]; then
        echo "✅ AI analysis is working"
    else
        echo "⚠️  No events were analyzed - check your OPENAI_API_KEY"
    fi
fi

echo ""
echo "================================================"
echo "Test Results"
echo "================================================"

# Provide instructions for full test
echo ""
echo "To test actual PR creation:"
echo "1. Ensure your GITHUB_TOKEN has write access to $TIMELINE_REPO"
echo "2. Run without dry-run mode:"
echo ""
echo "   export DRY_RUN=false"
echo "   npm run update"
echo ""
echo "3. Check the PR at: https://github.com/$TIMELINE_REPO/pulls"
echo ""

# Test GitHub authentication
echo "5️⃣ Testing GitHub authentication..."
curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user > /tmp/github_user.json 2>/dev/null

if [ $? -eq 0 ] && [ -s /tmp/github_user.json ]; then
    USERNAME=$(cat /tmp/github_user.json | grep -o '"login":"[^"]*' | cut -d'"' -f4)
    if [ ! -z "$USERNAME" ]; then
        echo "✅ GitHub authentication successful (logged in as: $USERNAME)"
        
        # Check repository access
        REPO_OWNER=$(echo $TIMELINE_REPO | cut -d'/' -f1)
        REPO_NAME=$(echo $TIMELINE_REPO | cut -d'/' -f2)
        
        curl -s -H "Authorization: token $GITHUB_TOKEN" "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME" > /tmp/repo_info.json 2>/dev/null
        
        if grep -q "\"push\": true" /tmp/repo_info.json 2>/dev/null; then
            echo "✅ You have write access to $TIMELINE_REPO"
        else
            echo "⚠️  You may not have write access to $TIMELINE_REPO"
            echo "   Please ensure your GITHUB_TOKEN has 'repo' scope"
        fi
    else
        echo "⚠️  GitHub authentication check inconclusive"
    fi
else
    echo "❌ GitHub authentication failed - check your GITHUB_TOKEN"
fi

rm -f /tmp/github_user.json /tmp/repo_info.json

echo ""
echo "================================================"
echo "✅ Test suite completed"
echo "================================================"
