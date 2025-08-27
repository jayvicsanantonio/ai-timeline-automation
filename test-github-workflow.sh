#!/bin/bash

# Test script to verify GitHub Action prerequisites
echo "🔍 Testing GitHub Action Workflow Prerequisites"
echo "================================================"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check environment variables
check_env_var() {
    local var_name="$1"
    local var_value="${!var_name}"
    
    if [ -z "$var_value" ]; then
        echo "❌ $var_name is not set"
        return 1
    elif [ "$var_value" = "your_openai_api_key_here" ] || [ "$var_value" = "your_github_personal_access_token_here" ]; then
        echo "⚠️  $var_name is set to placeholder value"
        return 1
    else
        echo "✅ $var_name is configured"
        return 0
    fi
}

# Check if running in the right directory
if [ ! -f "package.json" ] || [ ! -d ".github/workflows" ]; then
    echo "❌ Please run this script from the ai-timeline-automation directory"
    exit 1
fi

echo "📂 Directory structure: ✅"

# Check if Node.js is available
if command_exists node; then
    NODE_VERSION=$(node --version)
    echo "📦 Node.js: ✅ ($NODE_VERSION)"
else
    echo "❌ Node.js is not installed"
    exit 1
fi

# Check if npm is available
if command_exists npm; then
    echo "📦 npm: ✅"
else
    echo "❌ npm is not installed"
    exit 1
fi

# Check if project builds
echo ""
echo "🔨 Testing project build..."
if npm run build > /dev/null 2>&1; then
    echo "✅ Project builds successfully"
else
    echo "❌ Project build failed"
    echo "Run 'npm run build' to see the errors"
    exit 1
fi

# Check workflow files
echo ""
echo "🔍 Checking workflow files..."
WORKFLOW_FILE=".github/workflows/weekly-update.yml"
if [ -f "$WORKFLOW_FILE" ]; then
    echo "✅ Workflow file exists: $WORKFLOW_FILE"
    
    # Check for OpenAI references (should exist)
    if grep -q "OPENAI_API_KEY" "$WORKFLOW_FILE"; then
        echo "✅ Workflow uses OpenAI API key"
    else
        echo "❌ Workflow missing OpenAI API key reference"
    fi
    
    # Check for OpenRouter references (should not exist)
    if grep -q "OPENROUTER" "$WORKFLOW_FILE"; then
        echo "⚠️  Workflow still has OpenRouter references"
    else
        echo "✅ Workflow cleaned of OpenRouter references"
    fi
else
    echo "❌ Workflow file missing: $WORKFLOW_FILE"
fi

# Load environment variables for testing
echo ""
echo "🔍 Checking environment configuration..."
if [ -f ".env" ]; then
    source .env
    echo "✅ .env file loaded"
    
    # Check required environment variables
    check_env_var "OPENAI_API_KEY"
    check_env_var "GIT_TOKEN"  
    check_env_var "TIMELINE_REPO"
    
else
    echo "⚠️  .env file not found (this is expected for production)"
fi

echo ""
echo "📋 Summary for GitHub Action Configuration:"
echo "==========================================="
echo ""
echo "Required GitHub Repository Secrets:"
echo "  - OPENAI_API_KEY (your OpenAI API key)"
echo "  - GIT_TOKEN (GitHub Personal Access Token with repo permissions)"
echo ""
echo "Required GitHub Repository Variables:"
echo "  - TIMELINE_REPO (should be: jayvicsanantonio/ai-timeline)"
echo ""
echo "🎯 Next Steps:"
echo "1. Configure the secrets and variables in GitHub repository settings"
echo "2. Go to: https://github.com/jayvicsanantonio/ai-timeline-automation/settings/secrets/actions"
echo "3. Add the required secrets and variables as listed above"
echo "4. Test by manually triggering the workflow in the Actions tab"
echo "5. Use 'dry_run: true' for the first test to avoid creating actual PRs"
echo ""

# Test basic functionality with dry run if API key is available
if [ -n "$OPENAI_API_KEY" ] && [ "$OPENAI_API_KEY" != "your_openai_api_key_here" ]; then
    echo "🧪 Running basic functionality test..."
    echo "DRY_RUN=true npm run update"
    echo "(This will test news collection without AI analysis due to API costs)"
    echo ""
    echo "To run the full test (with AI analysis), run:"
    echo "DRY_RUN=true npm run update"
else
    echo "⏸️  Skipping functionality test (OPENAI_API_KEY not configured)"
fi

echo ""
echo "✅ Prerequisites check complete!"
