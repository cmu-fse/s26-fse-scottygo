# Copilot Instructions Test Cases

This document contains test scenarios to verify that `copilot-instructions.md` is working correctly.

## Test Scenarios

### ✅ Test 1: Specific Error Question

**User Query**: "What's wrong with line 50 in auth.controller.ts?"

**Expected Behavior**:

- Copilot should immediately check the file and error
- Should NOT start with "I can see you're working in..."
- Should directly explain the error

**Forbidden Response**:

- ❌ Starting with project overview
- ❌ Listing generic help options

---

### ✅ Test 2: Implementation Request

**User Query**: "Add a new endpoint for getting user profile"

**Expected Behavior**:

- Copilot should immediately start implementing
- Should create/modify files as needed
- Should NOT give an overview first

**Forbidden Response**:

- ❌ "How can I help you with this project?"
- ❌ Describing the workspace structure first

---

### ✅ Test 3: Architecture Question

**User Query**: "How does authentication work in this app?"

**Expected Behavior**:

- Copilot should explain the JWT/bcrypt auth system
- Use context from copilot-instructions.md
- Be specific about implementation

**Forbidden Response**:

- ❌ Generic project overview before answering
- ❌ "What would you like me to help with?"

---

### ✅ Test 4: Explicit Project Overview Request

**User Query**: "What is this project?" OR "Tell me about this project"

**Expected Behavior**:

- NOW Copilot SHOULD provide project overview
- Can describe ScottyGo, features, architecture
- This is the ONLY time to give overview

**Correct Response**:

- ✅ Describing ScottyGo as CMU transit hub
- ✅ Listing features and tech stack

---

### ✅ Test 5: Direct Task

**User Query**: "Fix the linting errors"

**Expected Behavior**:

- Copilot should check for errors
- Fix them immediately
- Brief confirmation when done

**Forbidden Response**:

- ❌ "I can see you're working in the s26-fse-scottygo workspace..."
- ❌ Asking what they want to work on

---

### ✅ Test 6: Code Review Request

**User Query**: "Review the auth.controller.ts file"

**Expected Behavior**:

- Read the file
- Provide specific code review feedback
- No project overview preamble

**Forbidden Response**:

- ❌ Starting with workspace structure description
- ❌ Generic "How can I help?" lists

---

## How to Test

1. **Manual Testing**: Try each query in a new Copilot chat
2. **Check Response Start**: First sentence should address the question directly
3. **Forbidden Phrases**: Responses should NOT start with:
   - "I can see you're working in..."
   - "This appears to be..."
   - "How can I help you with this project?"
   - "What would you like to work on?"
4. **Allowed Responses**: Should start with:
   - Direct answer to the question
   - Tool calls to investigate
   - Implementation of requested feature
   - "Let me check..." / "Let me fix..."

## Success Criteria

✅ **PASS**: Copilot answers question directly without preamble  
❌ **FAIL**: Copilot gives project overview or generic help list first

## Debugging Failed Tests

If tests fail:

1. Check if copilot-instructions.md is being loaded
2. Verify the CRITICAL INSTRUCTIONS section is at the top
3. Consider making instructions even more explicit
4. Add HTML comment wrapper to prevent markdown rendering
