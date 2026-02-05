(function () {
    // Lista completa de reemplazos de palabras específicas
    const reemplazos = [
        ["albanely", "Albanely"], ["ágreda", "Ágreda"],
        ["alirio", "Alirio"], ["arles", "Arles"], ["alier", "Alier"], ["arcos", "Arcos"],
        ["ardila", "Ardila"], ["argotti", "Argoty"], ["anuario", "Anuario"], ["aponte", "Aponte"], ["aura", "Aura"], ["asula", "Azula"],
        ["barreiro", "Barreiro"], ["bastidas", "Bastidas"], ["bernate", "Bernate"],
        ["belalcázar", "Belalcázar"], ["bravo", "Bravo"], ["brisueno", "Risueño"], ["borrero", "Borrero"], ["burbano", "Burbano"],
        ["calpa", "Calpa"], ["cuadros", "Cuadros"], ["calvache", "Calvache"], ["calvacci", "Calvachy"], ["coyez", "Goyes"], ["coyes", "Goyes"], ["constanza", "Constanza"],
        ["calvachi", "Calvachy"], ["calvachí", "Calvachy"], ["cedeño", "Cedeño"], ["chicaiza", "Chicaiza"], ["cangrejos", "Cangrejos"],
        ["collés", "Goyes"], ["canal", "Canal"], ["coral", "Coral"], ["correa", "Correa"], ["cortés", "Cortés"], ["cadena", "Cadena"], ["cierra", "Sierra"],
        ["cobo", "Cobo"], ["delgado", "Delgado"], ["derecho", "Derecho"], ["dolores", "Dolores"], ["doralba", "Doralba"],
        ["edilma", "Edilma"], ["escudero", "Escudero"], ["eulises", "Eulises"],
        ["especialización", "Especialización"], ["erazo", "Erazo"],
        ["estupiñán", "Estupiñán"],
        ["flor", "Flor"], ["flores", "Flores"], ["forero", "Forero"], ["familia", "Familia"], ["fresneda", "Fresneda"],
        ["garzón", "Garzón"], ["galvis", "Galvis"], ["galán", "Galán"], ["giraldo", "Giraldo"], ["goiles", "Goyes"], ["goyes", "Goyes"],
        ["goyés", "Goyes"], ["goyez", "Goyes"], ["goyis", "Goyes"], ["goiz", "Goyes"], ["guerra", "Guerra"], ["guido", "Guido"], ["greeicy", "Greeicy"],
        ["gloria", "Gloria"], ["giomar", "Giomar"],
        ["hoyos", "Hoyos"],
        ["insuasti", "Insuasty"], ["izquierdo", "Izquierdo"],
        ["jojoa", "Jojoa"],
        ["llano", "Llano"], ["lafon", "Lafon"], ["lagos", "Lagos"], ["leyton", "Leyton"], ["lazo", "Lasso"],
        ["legis", "LEGIS"], ["legarda", "Legarda"], ["libardo", "Libardo"], ["liborio", "Liborio"], ["livorio", "Livorio"], ["lizcano", "Lizcano"],
        ["luz", "Luz"], ["luna", "Luna"],
        ["mafla", "Mafla"], ["madroñero", "Madroñero"], ["maya", "Maya"],
        ["maturana", "Maturana"], ["marco", "Marco"], ["materón", "Materón"], ["mesa", "Mesa"], ["miriam", "Myriam"], ["manrique", "Manrique"],
        ["morasurco", "Morasurco"], ["monsalve", "Monsalve"], ["monsalvo", "Monsalvo"], ["morillo", "Morillo"], ["montanchez", "Montanchez"], ["montúfar", "Montúfar"],
        ["meza", "Mesa"],
        ["munera", "Munera"], ["maigual", "Maigual"], ["moncayo", "Moncayo"], ["montilla", "Montilla"],
        ["nariño", "Nariño"], ["navia", "Navia"], ["niño", "Niño"],
        ["ocaña", "Ocaña"], ["oliva", "Oliva"], ["osejo", "Osejo"], ["ocejo", "Osejo"], ["ocara", "OCARA"], ["omaira", "Omaira"],
        ["obando", "Obando"], ["oquendo", "Oquendo"],
        ["palacios", "Palacios"], ["para", "para"], ["paredes", "Paredes"], ["pasos", "Pasos"], ["peñafiel", "Peñafiel"], ["pinilla", "Pinilla"], ["poveda", "Poveda"], ["patarroyo", "Patarroyo"],
        ["perdomo", "Perdomo"],
        ["ramos", "Ramos"], ["reina", "Reina"], ["realpe", "Realpe"],
        ["risueño", "Risueño"], ["revelo", "Revelo"], ["riascos", "Riascos"], ["ríos", "Ríos"], ["rosa", "Rosa"], ["rojas", "Rojas"], ["rugeles", "Rugeles"],
        ["ruales", "Rúales"], ["sabogal", "Sabogal"], ["sarama", "Zarama"], ["sarasti", "Sarasti"],
        ["sevillano", "Sevillano"], ["solarte", "Solarte"], ["sotelo", "Sotelo"], ["segura", "Segura"], ["segundo", "Segundo"],
        ["tajumbina", "Tajumbina"], ["tazcón", "Tascón"], ["toscano", "Toscano"], ["toro", "Toro"], ["tutistar", "Tutistar"], ["timaran", "Timaran"],
        ["umaña", "Umaña"], ["universidad", "Universidad"], ["urresta", "Urresta"], ["urbano", "Urbano"], ["urrego", "Urrego"], ["urgiles", "Urgiles"],
        ["urigarro", "Urigarro"], ["vela", "Vela"], ["villota", "Villota"], ["villamil", "Villamil"],
        ["wanda", "Whanda"], ["vallejos", "Vallejos"], ["vallejo", "Vallejo"], ["vinueza", "Vinueza"], ["viteri", "Viteri"], ["vicuña", "Vicuña"], ["villacres", "Villacres"],
        ["yela", "Yela"], ["zarama", "Zarama"]
    ];

    // Variantes por patrón (Regex) para casos dinámicos
    const regexReemplazos = [
        [/^go(y[ei]s?|yez|y(é|e)s|yis|iz)$/i, "Goyes"],
        [/^calvach(i|í)$/i, "Calvachy"],
        [/^oce?jo$/i, "Osejo"],
        [/^legis$/i, "LEGIS"],
    ];

    // Exportar a window para que sean accesibles por el script de dictado
    window.REEMPLAZOS = reemplazos;
    window.REGEX_REEMPLAZOS = regexReemplazos;
})();
