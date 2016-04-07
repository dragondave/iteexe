var $exeMatEditor = {
	init : function(){
		// Set the save options
		e1.mathEditor("setSaveCallback", $exeMatEditor.save);	
		// Create the save buttons
		$("#editor1").before("<p id='saveButtons'><strong>Save: </strong><input type='button' value='LaTeX' onclick='$exeMatEditor.save(\"latex\")' /> <input type='button' value='MathML' onclick='$exeMatEditor.save(\"mathml\")' /></p>")
		// Load the previous values
		this.loadValues();
		// We hide some elements
		$("IMG").each(function(){
			var e = $(this);
			var src = e.attr("src");
			if (src=="img/toolbar_handler.png" || src=="img/toolbar_handlerV.png") e.hide();
		});
		// We set a smaller font size for the editor's footer (path)
		var corners = $(".ui-corner-all");
		corners.eq(corners.length-1).css({
			"font-size":"10px",
			"line-height":"21px"
		});		
	},
	save : function(language){
		try {
			var code = "";
			if (language=="mathml") {
				// type could be CHARS, ENTITIES or UNICODE;
				code = e1.mathEditor("getMathML", "UNICODE", "true");				
			} else {
				code = e1.mathEditor("getLatex");
			}
			opener.PasteMathDialog.mathEditor.field.value = code;
			window.close();
		} catch(e) {
			
		}
	},
	loadValues : function(){
		try {
			var code = opener.PasteMathDialog.mathEditor.field.value;
			if (code.indexOf("<math")!=-1) {
				e1.mathEditor("setMathML", code);
			} else {
				e1.mathEditor("setLatex", code);
			}
		} catch(e) {
			
		}
	}
}

$(function(){
	$exeMatEditor.init();
});