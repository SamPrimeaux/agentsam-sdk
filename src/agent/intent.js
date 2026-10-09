/**
 * Conservative turn routing. Only unambiguously general knowledge questions
 * omit repository perception and tool discovery. Project-referential requests
 * always remain in the normal context/tool path.
 */
export function isStandaloneKnowledgeQuestion(prompt) {
 const text=String(prompt||'').trim();
 if(text.length<4||text.length>300)return false;
 if(!/^(?:what (?:is|are|does|was)|define|explain|how (?:does|do)|why (?:is|are|does)|tell me about)\b/i.test(text))return false;
 if(/\b(?:my|our|this|current|repo|repository|codebase|project|workspace|file|directory|function|class|branch|terminal|commit|error|bug|debug|build|fix|create|edit|run|inspect|search|implement|compare|audit|here)\b/i.test(text))return false;
 return true;
}
