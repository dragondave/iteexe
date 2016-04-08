var $exeMatEditor = {
	i18n : {
		"menu_new":"New document",
		"menu_save":"Save",
		"menu_xml_edit":"Edit (XML/MathML)",
		"menu_tex_edit":"Edit (TeX)",
		"menu_edit_delete":"Delete",
		"menu_edit_cut":"Cut",
		"menu_edit_copy":"Copy",
		"menu_edit_paste_left":"Paste on the left",
		"menu_edit_paste_replace":"Paste (replace)",
		"menu_edit_paste_right":"Paste con the right",
		"menu_edit_undo":"Undo",
		"menu_edit_redo":"Redo",
		"menu_sign1":"Signs (1)",
		"menu_sign2":"Signs (2)",
		"menu_sign3":"Signs (3)",
		"menu_sign4":"Signs (4)",
		"menu_sign5":"Signs (5)",
		"menu_sign6":"Signs (6)",
		"menu_text1":"Text (1)",
		"menu_text2":"Text (2)",
		"menu_text3":"Text (3)",
		"menu_text4":"Text (4)",
		"menu_text5":"Text (5)",
		"menu_text6":"Text (6)",
		"menu_unicode":"Unicode",
		"menu_plus":"Plus",
		"menu_fraction":"Fraction",
		"menu_fence":"Fence",
		"menu_sum":"Sum",
		"menu_matrix":"Matrix",
		"menu_sin":"Sin",
		"menu_formulas":"Formulas",
		"win_insert_right":"Insert on the right",
		"win_insert_left":"Insert on the left"
	},
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