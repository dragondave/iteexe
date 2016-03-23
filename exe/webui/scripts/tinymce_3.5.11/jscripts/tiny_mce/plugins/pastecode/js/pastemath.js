var PasteMathDialog = {
	isMathImg : false,
	init : function() {
		
		if (!parent) {
			alert(tinyMCEPopup.getLang("pastecode.inline_popups_plugin_is_required"));
			return false;
		}
		if (typeof(parent.jQuery)!='function') {
			alert(tinyMCEPopup.getLang("pastecode.jquery_is_required"));
			return false;
		}		
        
        var useMathJaxSpan = document.getElementById("useMathJax");
		useMathJaxSpan.innerHTML = useMathJaxSpan.innerHTML.replace("mathjax.org","<a href='https://www.mathjax.org/' target='_blank'>mathjax.org</a>");        
		
		var pasteInstructionsSpan = document.getElementById("pasteInstructions");
		pasteInstructionsSpan.innerHTML = pasteInstructionsSpan.innerHTML.replace("eXeMathEditor","<a href='#' onclick='PasteMathDialog.mathEditor.start();return false'>fMath</a>");
        
        mcTabs.displayTab('general_tab','general_panel');        
		
		var f = document.forms[0];
		
		// Check if it's math code
		var ed = tinyMCEPopup.editor; 
		var n = ed.selection.getNode();
		if (n.nodeName == 'IMG') {
			var dom = ed.dom; 
			var x = f.elements; 
			var step1 = n.parentNode;
			if (step1 && step1.nodeName=="P" && dom.getAttrib(step1, 'class').indexOf("exe-math-img")!=-1) {
				var step2 = step1.parentNode;
				if (step2 && step2.nodeName=="DIV" && step2.className.indexOf("exe-math ")!=-1) {
					this.isMathImg = true;
					this.mathImageBlock = step2;
					
					// Get the original image HTML
					var imageSrc = dom.getAttrib(n, 'src');
					var imageWidth = dom.getAttrib(n, 'width');
					var imageHeight = dom.getAttrib(n, 'height');
					this.originalImage = "<img alt='$PasteMathDialogAlt' src='"+imageSrc+"' width='"+imageWidth+"' height='"+imageHeight+"' />";
					
					// Alt and src
					x.src.value = imageSrc;
					x.imgAlt.value = dom.getAttrib(n, 'alt');
					
					// Get the original code
					var htmlSource = parent.jQuery(".exe-math-code",step2).html();
					this.htmlSource = htmlSource;
					f.htmlSource.value = htmlSource;
					
					// Type
					var showImage = step2.className.indexOf("show-image")!=-1;
					if (showImage) {
						this.setSelectedOption("use","image");
						PasteMathDialog.toggleMathJax();
					}
					// MathJax
					if (!showImage && step2.className.indexOf("exe-math-engine")==-1) x.mathjax.checked = false;
				}
			}
		} else {
			// Get the selected contents as text and place it in the input
			f.htmlSource.value = tinyMCEPopup.editor.selection.getContent({format : 'text'});
		}
	},
	mathEditor : {
		isWarned : false,
		start : function(){
			PasteMathDialog.mathEditor.field = document.getElementById("htmlSource");
			if (PasteMathDialog.mathEditor.isWarned==false) {
				var extra = tinyMCEPopup.getLang('pastecode.equation_editor_warning')+'\n\n';
				if (PasteMathDialog.mathEditor.field.value=="") extra = "";
				tinyMCEPopup.confirm(extra+tinyMCEPopup.getLang('pastecode.equation_editor_instructions'), function(s) {
					if (s) {
						PasteMathDialog.mathEditor.isWarned = true;
						PasteMathDialog.mathEditor.start();
					}
				});
				return false;
			}
			var mypage = "/tools/fMath/";
			var myname = tinyMCEPopup.getLang("pastecode.equation_editor");
			var w = 983;
			var features = "titlebar=no,toolbar=no,location=no,status=no,menubar=no,scrollbars=no,resizable=no";
			var h = 418;
			var win = null;
			var winl = (screen.width-w)/2;
			var wint = (screen.height-h)/2;
			if (winl < 0) winl = 0;
			if (wint < 0) wint = 0;
			var settings = 'height=' + h + ',';
			settings += 'width=' + w + ',';
			settings += 'top=' + wint + ',';
			settings += 'left=' + winl + ',';
			settings += features;
			win = window.open(mypage,myname,settings);
			win.window.focus();
		}
	},
	setSelectedOption : function(n,v){
		var radios = document.getElementsByName(n);
		for (var i = 0, length = radios.length; i < length; i++) {
			if (radios[i].value==v) {
				radios[i].checked = "checked";
				break;
			}
		}		
	},	
	getSelectedOption : function(n){
		var radios = document.getElementsByName(n);
		for (var i = 0, length = radios.length; i < length; i++) {
			if (radios[i].checked) {
				return radios[i].value;
				break;
			}
		}	
	},	
	createMathImage : function(field_name, src_latex, font_size) {
		
		// Update the image only if the code has changed:
		if (this.isMathImg && this.htmlSource==src_latex) {
			// Insert the new code
			var alt = document.getElementById('imgAlt').value;
			if (alt=="") {
				tinyMCEPopup.confirm(tinyMCEPopup.getLang('pastecode.missing_alt'), function(s) {
					if (s) {
						PasteMathDialog.insertMath(src,"",alt); // The image has not changed (img == "")
					}
				});
			} else {
				this.insertMath(src,"",alt); // The image has not changed (img == "")
			}
			return false;
		}
		
		var win = window;
	
		var w = "";
		if (typeof(top.nevow_clientToServerEvent)!='undefined') {
			w = top;
		} else {
			alert(tinyMCEPopup.getLang("pastecode.inline_popups_plugin_is_required"));
			return;
		}

		var local_imagePath = ""

		if (src_latex == "") {
			return;
		}

		if (typeof(w.curr_edits_math_num)=='undefined') w.curr_edits_math_num = 0;			

		// to help unique-ify each previewed math image:
		var preview_basename = "eXe_LaTeX_math_"+w.curr_edits_math_num
		var preview_math_imagefile = preview_basename+".gif"
		// Simplify the subsequent file-lookup process,  by just appending 
		// the ".tex" to the full image name, as such:
		var preview_math_srcfile = preview_math_imagefile+".tex"

		w.curr_edits_math_num += 1

		// netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");
		// pass the file information on to the server,
		// to generate the image into the server's "previews" directory:
		w.nevow_clientToServerEvent(
			'generateTinyMCEmath', 
			this, 
			'', 
			win, 
			win.name, 
			field_name, 
			src_latex, 
			4, 
			preview_math_imagefile, 
			preview_math_srcfile
		);

		// once the image has been generated, it SHOULD be sitting here:
		var full_preview_url = "/previews/"+preview_math_imagefile;

		win.focus();

		// clear out any old value in the tinyMCE image filename field:
		win.document.forms[0].elements[field_name].value = ""; 
		// PreviewImage is only available for images:
		this.updateImage(" ");
		// the above two commands are the only way to really 
		// ensure that we can trigger the onchange event below:

		// set the tinyMCE image filename field:
		win.document.forms[0].elements[field_name].value = full_preview_url;
		// then force its onchange event:
		// PreviewImage is only available for images:
		this.updateImage(full_preview_url);

	},	
	getMathBlockClass : function(){
		var type = this.getSelectedOption("use");
		var k = "exe-math show-"+type;
		if (type == "code" && document.getElementById("mathjax").checked) {
			k += " exe-math-engine";
		}
        var position = "position-center";
        if (this.isMathImg) {
            // Respect the alignment
            var klass = parent.jQuery(this.mathImageBlock).attr("class");
            if (klass.indexOf(" position-left")!=-1) position = "position-left";
            else if (klass.indexOf(" position-right")!=-1) position = "position-right";
            else if (klass.indexOf(" float-left")!=-1) position = "float-left";
            else if (klass.indexOf(" float-right")!=-1) position = "float-right";
        }
        k += " "+position;
		return k;
	},
	insertMath : function(src,img,alt){
		alt = alt.replace(/"/g, "&quot;");
		var content = "<div class='"+this.getMathBlockClass()+"'>";
		if (this.isMathImg) {
			parent.jQuery(this.mathImageBlock).remove();
			// The image has not changed
			if (img=="") content += "<p class='exe-math-img'>"+this.originalImage.replace("$PasteMathDialogAlt",alt)+"</p>";
			// The imagen has changed
			else content += "<p class='exe-math-img'><img alt='"+alt+"' src='"+src+"' width='"+img.width+"' height='"+img.height+"' /></p>";
		} else {
			content += "<p class='exe-math-img'><img alt='"+alt+"' src='"+src+"' width='"+img.width+"' height='"+img.height+"' /></p>";
		}
		content += "<p class='exe-math-code'>"+this.mathCode+"</p>";
		content += "</div>";		
		if (!this.isMathImg) content += "<br />";		
		tinyMCEPopup.editor.execCommand('mceInsertContent', false, content);
		tinyMCEPopup.close();		
	},
	updateImageData : function(e){
		var src = e.src;
		if (src.indexOf("/")!=0) {
			// Remove domain, etc.
			var loc = window.location;
			src = src.replace("http://","");
			src = src.replace("https://","");
			src = src.replace(loc.hostname+":"+loc.port,"");
			src = src.replace(loc.hostname,"");
		}
		var img = document.getElementById('previewImg');		
		if (img) {	
			// Insert the new code
			var alt = document.getElementById('imgAlt').value;
			if (alt=="") {
				tinyMCEPopup.confirm(tinyMCEPopup.getLang('pastecode.missing_alt'), function(s) {
					if (s) {
						PasteMathDialog.insertMath(src,img,alt);
					}
				});
			} else {
				this.insertMath(src,img,alt);
			}
		}	
	},	
	updateImage : function(src) {
		var elm = document.getElementById('prev');
		if (src!="") {
			elm.innerHTML = '<img id="previewImg" src="' + src + '" onload="PasteMathDialog.updateImageData(this);" />'
		} else {
			elm.innerHTML = "";
		}
	},	
	toggleMathJax : function(){
		var type = this.getSelectedOption("use");
		var h = 122;
		var display = "block";
		if (type=="image") {
			display = "none";
			h = 149;
		}
		document.getElementById("useMathJax").style.display = display;
		document.getElementById("htmlSource").style.height = h+"px";
	},
	insert : function() {
		var f = document.forms[0];
		var content = f.htmlSource.value;
		if (content!="") {
            this.mathCode = content;
            this.createMathImage("src",content);
        }
		return false;
	}
};
tinyMCEPopup.onInit.add(PasteMathDialog.init, PasteMathDialog);